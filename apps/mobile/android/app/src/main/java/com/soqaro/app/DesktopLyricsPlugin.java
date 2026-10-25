package com.soqaro.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * System-level floating lyrics for the Android shell. A WindowManager overlay
 * (TYPE_APPLICATION_OVERLAY) draws the current lyric line with per-character
 * karaoke fill plus the translation, staying on top of every other app.
 *
 * State flow: the webview pushes char-level word timings once per line
 * (updateLine) and a play/progress anchor on every progress tick
 * (updatePlayback); this view interpolates elapsed time per frame so the fill
 * advances at display refresh rate without bridge traffic.
 *
 * Implemented in Java (not Kotlin) on purpose: the app Gradle module has no
 * Kotlin plugin applied, so .kt sources would silently not compile in CI.
 */
@CapacitorPlugin(name = "DesktopLyrics")
public class DesktopLyricsPlugin extends Plugin {
    private LyricsOverlayView overlayView;
    private WindowManager windowManager;

    @PluginMethod
    public void toggle(PluginCall call) {
        android.app.Activity activity = bridge.getActivity();
        if (activity == null) {
            call.resolve(overlayResult(false, false));
            return;
        }
        if (!Settings.canDrawOverlays(activity)) {
            // Send the user to the "display over other apps" settings page;
            // toggling again after granting will show the overlay.
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + activity.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            call.resolve(overlayResult(false, false));
            return;
        }

        final DesktopLyricsPlugin plugin = this;
        bridge.executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                LyricsOverlayView overlay = plugin.ensureOverlay();
                if (overlay == null) {
                    call.resolve(overlayResult(false, false));
                    return;
                }
                boolean visible = overlay.toggle();
                call.resolve(overlayResult(true, visible));
            }
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        bridge.executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                if (overlayView != null) {
                    overlayView.setHidden(true);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void updateLine(PluginCall call) {
        final String words = call.getString("words") != null ? call.getString("words") : "[]";
        final String translation = call.getString("translation");
        final String romanized = call.getString("romanized");
        bridge.executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                LyricsOverlayView overlay = overlayView;
                if (overlay != null) {
                    overlay.setLine(words, translation, romanized);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void updatePlayback(PluginCall call) {
        final boolean isPlaying = call.getBoolean("isPlaying", false);
        final double progressMs = call.getDouble("progressMs") != null ? call.getDouble("progressMs") : 0.0;
        final double at = call.getDouble("at") != null ? call.getDouble("at") : System.currentTimeMillis();
        bridge.executeOnMainThread(new Runnable() {
            @Override
            public void run() {
                LyricsOverlayView overlay = overlayView;
                if (overlay != null) {
                    overlay.updatePlayback(isPlaying, progressMs, at);
                }
                call.resolve();
            }
        });
    }

    private JSObject overlayResult(boolean granted, boolean visible) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("visible", visible);
        return result;
    }

    private LyricsOverlayView ensureOverlay() {
        if (overlayView != null) {
            return overlayView;
        }
        android.app.Activity activity = bridge.getActivity();
        if (activity == null || !Settings.canDrawOverlays(activity)) {
            return null;
        }
        try {
            WindowManager manager = (WindowManager) activity.getSystemService(Context.WINDOW_SERVICE);
            LyricsOverlayView view = new LyricsOverlayView(activity);
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
            int marginPx = dp(16f);
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    Math.max(0, activity.getResources().getDisplayMetrics().widthPixels - marginPx * 2),
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                    PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            params.y = dp(96f);
            view.bindWindow(manager, params);
            manager.addView(view, params);
            windowManager = manager;
            overlayView = view;
            return view;
        } catch (Exception error) {
            return null;
        }
    }

    private int dp(float value) {
        float density = bridge.getActivity() != null
                ? bridge.getActivity().getResources().getDisplayMetrics().density
                : 1f;
        return (int) (value * density);
    }

    /**
     * The overlay surface: rounded translucent card, dim base line with a
     * white per-character karaoke fill, translation below, draggable
     * vertically.
     */
    public static class LyricsOverlayView extends View {
        private static final class Segment {
            final String text;
            final double startMs;
            final double durationMs;

            Segment(String text, double startMs, double durationMs) {
                this.text = text;
                this.startMs = startMs;
                this.durationMs = durationMs;
            }
        }

        private final Handler mainHandler = new Handler(Looper.getMainLooper());

        private Segment[] segments = new Segment[0];
        private String translationLine;
        private boolean hasLine;
        private boolean hidden = true;
        private boolean isPlaying;
        private double anchorProgressMs;
        private long anchorAtMs = System.currentTimeMillis();

        private WindowManager windowManager;
        private WindowManager.LayoutParams windowParams;
        private float dragOffsetY;
        private boolean dragActive;

        private final Paint backgroundPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint basePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint subPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint messagePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

        private final Runnable frameRunnable = new Runnable() {
            @Override
            public void run() {
                if (isPlaying && !hidden && hasLine) {
                    invalidate();
                    // ~30fps matches the karaoke fill granularity; 60fps full-view
                    // invalidates on a translucent overlay drain battery needlessly.
                    mainHandler.postDelayed(this, 33);
                }
            }
        };

        LyricsOverlayView(Context context) {
            super(context);
            backgroundPaint.setColor(Color.argb(178, 12, 14, 19));
            basePaint.setColor(Color.argb(115, 255, 255, 255));
            basePaint.setFakeBoldText(true);
            fillPaint.setColor(Color.WHITE);
            fillPaint.setFakeBoldText(true);
            subPaint.setColor(Color.argb(150, 255, 255, 255));
            messagePaint.setColor(Color.argb(170, 255, 255, 255));
            messagePaint.setFakeBoldText(true);
        }

        void bindWindow(WindowManager manager, WindowManager.LayoutParams params) {
            windowManager = manager;
            windowParams = params;
        }

        void setLine(String wordsJson, String translation, String romanized) {
            java.util.List<Segment> parsed = new java.util.ArrayList<>();
            try {
                JSONArray array = new JSONArray(wordsJson);
                for (int index = 0; index < array.length(); index++) {
                    org.json.JSONObject item = array.optJSONObject(index);
                    if (item == null) continue;
                    String text = item.optString("t", "");
                    double startMs = item.optDouble("s", Double.NaN);
                    double durationMs = item.optDouble("d", Double.NaN);
                    if (!text.isEmpty() && !Double.isNaN(startMs) && !Double.isNaN(durationMs)) {
                        parsed.add(new Segment(text, startMs, Math.max(0.0, durationMs)));
                    }
                }
            } catch (Exception error) {
                parsed.clear();
            }
            segments = parsed.toArray(new Segment[0]);
            hasLine = segments.length > 0;
            translationLine = translation != null ? translation : romanized;
            requestLayout();
            invalidate();
            if (hasLine && isPlaying && !hidden) {
                mainHandler.removeCallbacks(frameRunnable);
                mainHandler.post(frameRunnable);
            }
        }

        void updatePlayback(boolean playing, double progressMs, double at) {
            isPlaying = playing;
            anchorProgressMs = progressMs;
            anchorAtMs = (long) at;
            if (playing && !hidden) {
                mainHandler.removeCallbacks(frameRunnable);
                mainHandler.post(frameRunnable);
            }
            invalidate();
        }

        void setHidden(boolean value) {
            hidden = value;
            setVisibility(value ? GONE : VISIBLE);
            if (!value && isPlaying) {
                mainHandler.removeCallbacks(frameRunnable);
                mainHandler.post(frameRunnable);
            }
        }

        boolean toggle() {
            setHidden(!hidden);
            return !hidden;
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (windowParams == null) return false;
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    dragActive = true;
                    dragOffsetY = event.getRawY() - windowParams.y;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (dragActive) {
                        windowParams.y = (int) (event.getRawY() - dragOffsetY);
                        windowManager.updateViewLayout(this, windowParams);
                        return true;
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    dragActive = false;
                    return true;
                default:
                    break;
            }
            return super.onTouchEvent(event);
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int width = MeasureSpec.getSize(widthMeasureSpec);
            int horizontalPadding = dp(18f);
            int available = Math.max(0, width - horizontalPadding * 2);
            fitTextSize(available);
            Paint.FontMetrics fontMetrics = basePaint.getFontMetrics();
            float lineHeight = fontMetrics.bottom - fontMetrics.top;
            float measured = dp(14f) * 2 + lineHeight;
            if (translationLine != null && !translationLine.isEmpty()) {
                measured += dp(6f) + subPaint.getTextSize() * 1.3f;
            }
            setMeasuredDimension(width, resolveHeight((int) measured, heightMeasureSpec));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float width = getWidth();
            float height = getHeight();
            float corner = dp(18f);
            canvas.drawRoundRect(
                    new RectF(dp(8f), 0f, width - dp(8f), height),
                    corner,
                    corner,
                    backgroundPaint);

            float horizontalPadding = dp(18f);
            float available = width - horizontalPadding * 2;

            if (!hasLine) {
                String message = "暂无歌词";
                float textHeight = messagePaint.getFontMetrics().bottom - messagePaint.getFontMetrics().top;
                float y = height / 2f - textHeight / 2f - messagePaint.getFontMetrics().ascent;
                canvas.drawText(message, horizontalPadding, y, messagePaint);
                return;
            }

            double elapsed = isPlaying
                    ? anchorProgressMs + Math.max(0.0, System.currentTimeMillis() - anchorAtMs)
                    : anchorProgressMs;

            Paint.FontMetrics fontMetrics = basePaint.getFontMetrics();
            float lineBaseline = dp(14f) - fontMetrics.ascent;

            // Dim base pass, then the karaoke fill pass clipped to per-character
            // progress so CJK and latin text both advance smoothly.
            float cursor = horizontalPadding;
            for (Segment segment : segments) {
                float textWidth = basePaint.measureText(segment.text);
                canvas.drawText(segment.text, cursor, lineBaseline, basePaint);
                double segmentProgress;
                if (elapsed <= segment.startMs) {
                    segmentProgress = 0.0;
                } else if (elapsed >= segment.startMs + segment.durationMs || segment.durationMs <= 0.0) {
                    segmentProgress = 1.0;
                } else {
                    segmentProgress = (elapsed - segment.startMs) / segment.durationMs;
                }
                if (segmentProgress > 0.0) {
                    float fillWidth = (float) (textWidth * segmentProgress);
                    canvas.save();
                    canvas.clipRect(cursor, 0f, Math.min(cursor + fillWidth, width - horizontalPadding), height);
                    canvas.drawText(segment.text, cursor, lineBaseline, fillPaint);
                    canvas.restore();
                }
                cursor += textWidth;
                if (cursor >= width - horizontalPadding) break;
            }

            if (translationLine != null && !translationLine.isEmpty()) {
                String text = ellipsize(translationLine, subPaint, available);
                float subBaseline = lineBaseline + dp(6f) + subPaint.getTextSize();
                canvas.drawText(text, horizontalPadding, subBaseline, subPaint);
            }
        }

        private String ellipsize(String value, Paint paint, float available) {
            if (paint.measureText(value) <= available) return value;
            String text = value;
            while (!text.isEmpty() && paint.measureText(text + "…") > available) {
                text = text.substring(0, text.length() - 1);
            }
            return text + "…";
        }

        private void fitTextSize(int available) {
            if (available <= 0) return;
            float total = 0f;
            for (Segment segment : segments) {
                total += basePaint.measureText(segment.text);
            }
            if (total > available && total > 0f) {
                float scale = available / total;
                basePaint.setTextSize(basePaint.getTextSize() * scale);
                fillPaint.setTextSize(fillPaint.getTextSize() * scale);
            }
        }

        private int resolveHeight(int measured, int heightMeasureSpec) {
            int mode = MeasureSpec.getMode(heightMeasureSpec);
            if (mode == MeasureSpec.EXACTLY) return MeasureSpec.getSize(heightMeasureSpec);
            if (mode == MeasureSpec.AT_MOST) {
                return Math.min(measured, MeasureSpec.getSize(heightMeasureSpec));
            }
            return measured;
        }

        private int dp(float value) {
            return (int) (value * getResources().getDisplayMetrics().density);
        }
    }
}
