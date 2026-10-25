package com.soqaro.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 应用内更新:下载 APK(系统 DownloadManager,自带断点/通知栏进度)并拉起安装器。
 * 三个方法配合使用:downloadApk 启动下载 → getDownloadStatus 轮询进度 →
 * 完成后 installApk 拉起系统安装器。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String FILE_PROVIDER_AUTHORITY = "top.witw.soqaro.lite.fileprovider";
    private static final long STALE_DOWNLOAD_MS = 30 * 60 * 1000L;

    private long downloadId = -1;
    private BroadcastReceiver completionReceiver;

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        String versionName = call.getString("versionName", "update");
        if (url == null || url.trim().isEmpty()) {
            call.reject("缺少下载地址。");
            return;
        }

        Context context = getContext();
        // 幂等:已有进行中的下载直接复用。
        if (downloadId != -1 && isDownloadRunning()) {
            JSObject reuse = new JSObject();
            reuse.put("downloadId", downloadId);
            reuse.put("resumed", true);
            call.resolve(reuse);
            return;
        }

        unregisterCompletionReceiver();

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        String fileName = "Soqaro-" + versionName + ".apk";
        request.setTitle("Soqaro " + versionName);
        request.setDescription("正在下载更新包…");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(false);

        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("下载服务不可用。");
            return;
        }
        downloadId = manager.enqueue(request);

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(completionReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context receiverContext, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) notifyComplete(id);
                }
            }, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(completionReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context receiverContext, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) notifyComplete(id);
                }
            }, filter);
        }

        JSObject result = new JSObject();
        result.put("downloadId", downloadId);
        result.put("resumed", false);
        call.resolve(result);
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        Double idDouble = call.getDouble("downloadId");
        if (idDouble == null) {
            call.reject("缺少 downloadId。");
            return;
        }
        long id = idDouble.longValue();
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("下载服务不可用。");
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        Cursor cursor = manager.query(query);
        JSObject result = new JSObject();
        if (cursor == null || !cursor.moveToFirst()) {
            result.put("status", "failed");
            result.put("progress", 0);
            result.put("reason", "下载任务不存在(可能已被系统清理),请重新开始下载。");
            if (cursor != null) cursor.close();
            call.resolve(result);
            return;
        }

        int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
        int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
        int downloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
        int totalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
        int status = cursor.getInt(statusIndex);
        int reason = cursor.getInt(reasonIndex);
        long downloaded = cursor.getLong(downloadedIndex);
        long total = cursor.getLong(totalIndex);
        int progress = total > 0 ? (int) Math.min(100, Math.round(downloaded * 100.0 / total)) : 0;
        cursor.close();

        String state;
        switch (status) {
            case DownloadManager.STATUS_SUCCESSFUL:
                state = "successful";
                break;
            case DownloadManager.STATUS_FAILED:
                state = "failed";
                break;
            case DownloadManager.STATUS_PAUSED:
                state = "paused";
                break;
            default:
                state = "running";
        }
        result.put("status", state);
        result.put("progress", progress);
        if (status == DownloadManager.STATUS_FAILED) {
            result.put("reason", "下载失败(原因代码 " + reason + ")。");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        Context context = getContext();
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("下载服务不可用。");
            return;
        }

        // Android 8.0+ 需要用户授予“安装未知应用”权限,引导去设置页。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
            );
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settingsIntent);
            call.reject("需要授予“安装未知应用”权限后重试。");
            return;
        }

        Uri downloadUri = manager.getUriForDownloadedFile(downloadId);
        if (downloadUri == null) {
            // 下载记录可能已被清理:回退到 Downloads 公共目录里的同名文件。
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File fallback = new File(downloadsDir, "Soqaro-update.apk");
            if (fallback.exists()) {
                downloadUri = FileProvider.getUriForFile(
                    context, FILE_PROVIDER_AUTHORITY, fallback
                );
            }
        }
        if (downloadUri == null) {
            call.reject("未找到已下载的安装包,请重新下载。");
            return;
        }

        Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE, downloadUri);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(installIntent);
            call.resolve();
        } catch (Exception error) {
            call.reject("无法启动安装器: " + error.getMessage());
        }
    }

    /** DownloadManager 只暴露下载中/失败,不给“开始时间”:超期任务视为失效,避免复用陈旧下载。 */
    private boolean isDownloadRunning() {
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null || downloadId == -1) return false;
        Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
        if (cursor == null || !cursor.moveToFirst()) return false;
        int status = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_STATUS));
        cursor.close();
        return status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PAUSED
            || status == DownloadManager.STATUS_PENDING;
    }

    private void notifyComplete(long id) {
        JSObject payload = new JSObject();
        payload.put("downloadId", id);
        notifyListeners("apkDownloadComplete", payload);
    }

    private void unregisterCompletionReceiver() {
        if (completionReceiver != null) {
            try {
                getContext().unregisterReceiver(completionReceiver);
            } catch (IllegalArgumentException ignored) {
                // receiver 可能尚未注册
            }
            completionReceiver = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        unregisterCompletionReceiver();
        super.handleOnDestroy();
    }
}
