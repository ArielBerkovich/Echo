import {
  ChevronDown,
  Code,
  Link,
  List,
  ListOrdered,
  Plus,
  Quote,
  Send,
  Smile,
  SquareCode,
} from "lucide-react";

const icon = (Icon) => () => <Icon size={19} strokeWidth={1.7} />;

export const LinkIcon = icon(Link);
export const OrderedListIcon = icon(ListOrdered);
export const BulletListIcon = icon(List);
export const QuoteIcon = icon(Quote);
export const CodeIcon = icon(Code);
export const CodeBlockIcon = icon(SquareCode);
export const PlusIcon = icon(Plus);
export const SmileyIcon = icon(Smile);
export const SendIcon = icon(Send);
export const ChevronIcon = icon(ChevronDown);
