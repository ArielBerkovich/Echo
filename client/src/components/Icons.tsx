import {
  Bookmark,
  Copy,
  ExternalLink,
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  SmilePlus,
  Trash2,
  UserPlus,
} from "lucide-react";

const icon = (Icon, size = 16) => () => <Icon size={size} strokeWidth={1.7} />;

export const PencilIcon = icon(Pencil, 15);
export const TrashIcon = icon(Trash2, 15);
export const ReplyIcon = icon(MessagesSquare);
export const MoreIcon = icon(MoreHorizontal);
export const EmojiAddIcon = icon(SmilePlus);
export const ShareIcon = icon(ExternalLink);
export const CopyIcon = icon(Copy);
export const BookmarkIcon = icon(Bookmark);
export const PersonAddIcon = icon(UserPlus);
export const PinIcon = icon(Pin, 15);
export const LeaveIcon = icon(LogOut);
