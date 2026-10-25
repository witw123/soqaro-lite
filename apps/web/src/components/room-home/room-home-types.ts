import {
  defaultRoomMemberPermissions,
  type RoomMemberPermissions,
  type RoomType
} from "@soqaro/shared";

export type CreateRoomForm = {
  visibility: "public" | "private";
  name: string;
  description: string;
  password: string;
  roomType: RoomType;
  newMemberPermissions: RoomMemberPermissions;
};

export const emptyCreateRoomForm: CreateRoomForm = {
  visibility: "public",
  name: "",
  description: "",
  password: "",
  roomType: "interactive",
  newMemberPermissions: { ...defaultRoomMemberPermissions }
};

export function roomTypeLabel(roomType: RoomType) {
  return roomType === "request" ? "点歌房" : roomType === "radio" ? "自由电台" : "多人互动房";
}

export function roomTypeDescription(roomType: RoomType) {
  return roomType === "request"
    ? "成员提交歌曲，由房主审核后加入队列"
    : roomType === "radio"
      ? "主持人策展播出，听众专注收听"
      : "成员共同管理曲库、队列与播放";
}
