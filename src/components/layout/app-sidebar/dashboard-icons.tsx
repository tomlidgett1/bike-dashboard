"use client";

import type { ComponentType, ReactNode } from "react";
import type { IconProps } from "@solar-icons/react";
import { SolarProvider } from "@solar-icons/react";
import {
  AddCircle,
  AddFolder,
  AltArrowDown,
  AltArrowLeft,
  AltArrowRight,
  AltArrowUp,
  Archive,
  Bag,
  Banknote,
  Bell,
  Bill,
  BillList,
  Bolt,
  Book,
  Box,
  Buildings2,
  CalendarDate,
  Camera,
  Card,
  Chart,
  Chart2,
  ChatLine,
  ChatRound,
  ChatSquare,
  CheckCircle,
  Checklist,
  CheckRead,
  ClipboardList,
  ClockCircle,
  CloseCircle,
  CloseSquare,
  Compass,
  Copy,
  Cpu,
  Crown,
  Cursor,
  DangerCircle,
  DangerTriangle,
  Database,
  Delivery,
  DiplomaVerified,
  Diskette,
  Dislike,
  Document,
  DocumentText,
  Dollar,
  Download,
  Eye,
  EyeClosed,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  ForbiddenCircle,
  Gallery,
  GalleryAdd,
  GalleryRemove,
  Ghost,
  Gift,
  Globus,
  Graph,
  GraphDown,
  GraphUp,
  HamburgerMenu,
  HandShake,
  HeadphonesRound,
  Heart,
  Hashtag,
  Help,
  History,
  HomeSmile,
  Inbox,
  InboxIn,
  InfoCircle,
  KickScooter,
  Laptop,
  Layers,
  Leaf,
  Letter,
  Lightbulb,
  LetterOpened,
  Like,
  Link,
  List,
  ListCheck,
  Lock,
  Logout,
  MagicStick3,
  Magnifer,
  MagniferZoomIn,
  Mailbox,
  MapPoint,
  Maximize,
  MedalRibbon,
  MedalStar,
  MenuDots,
  Minimize,
  MinusCircle,
  Monitor,
  Moon,
  Palette,
  Pen,
  Pen2,
  PenNewSquare,
  Phone,
  PhoneCalling,
  Plain,
  Play,
  PlayCircle,
  Power,
  Printer,
  Pulse,
  QuestionCircle,
  Record,
  RecordCircle,
  Refresh,
  Restart,
  RoundTransferHorizontal,
  Route,
  Scale,
  Scanner,
  SendSquare,
  Settings,
  Share,
  ShareCircle,
  Shield,
  Sidebar,
  SidebarMinimalistic,
  StreetsNavigation,
  ShieldCheck,
  Shop,
  SkipNext,
  SliderHorizontal,
  Smartphone,
  SortVertical,
  Soundwave,
  SquareArrowRightDown,
  SquareArrowRightUp,
  Star,
  Stop,
  StopCircle,
  Sun,
  Tag,
  Target,
  TestTube,
  Text,
  Ticket,
  TrashBinTrash,
  TShirt,
  Tuning2,
  UndoLeft,
  Upload,
  User,
  UserBlock,
  UserCross,
  UsersGroupRounded,
  VerifiedCheck,
  VolumeLoud,
  Widget,
  Widget2,
  Widget3,
  Widget4,
  Widget5,
  Widget6,
  WidgetAdd,
  VideoFrame,
  Cart,
  Armchair,
} from "@solar-icons/react";
import { cn } from "@/lib/utils";

export type SidebarIcon = ComponentType<IconProps>;
export type DashboardIcon = SidebarIcon;
/** @deprecated Use DashboardIcon */
export type LucideIcon = DashboardIcon;

const SOLAR_DEFAULTS = {
  weight: "Linear" as const,
  color: "currentColor",
};

const SOLAR_SVG_PROPS = {
  strokeWidth: 2,
};

export function DashboardSolarProvider({ children }: { children: ReactNode }) {
  return (
    <SolarProvider value={SOLAR_DEFAULTS} svgProps={SOLAR_SVG_PROPS}>
      {children}
    </SolarProvider>
  );
}

/** @deprecated Use DashboardSolarProvider */
export const SidebarSolarProvider = DashboardSolarProvider;

export function Loader2({ className, ...props }: IconProps) {
  return <Refresh className={cn("animate-spin", className)} {...props} />;
}

/** Simple tick for menus, selects, and radio items (Lucide CheckIcon equivalent). */
export function CheckIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4", className)}
      aria-hidden
      {...props}
    >
      <path
        d="M4 12.9L7.14286 16.5L15 7.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandIcon({ children, className, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4", className)}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/** Lucide Apple equivalent — stroke-based for marketplace brand buttons. */
export function Apple({ className, ...props }: IconProps) {
  return (
    <BrandIcon className={className} {...props}>
      <path
        d="M17 10.5c-.1-2.1 1.6-3.1 1.7-3.2-1-.1-2 .6-2.5.6-.5 0-1.3-.6-2.1-.6-1.1 0-2.1.6-2.7 1.6-1.1 2-0.3 4.9 0.8 6.5.5.8 1.1 1.6 1.9 1.6.8 0 1-.5 2-.5s1.2.5 2 .5c.8 0 1.3-.7 1.8-1.4.6-.8.8-1.6.8-1.7-.1 0-1.5-.6-1.5-2.3zM14.5 4.8c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.5-.7 1.2-.6 1.8.7.1 1.3-.3 1.7-.8z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </BrandIcon>
  );
}

export function Facebook({ className, ...props }: IconProps) {
  return (
    <BrandIcon className={className} {...props}>
      <path
        d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v9h4v-9h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </BrandIcon>
  );
}

export function Instagram({ className, ...props }: IconProps) {
  return (
    <BrandIcon className={className} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={2} />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </BrandIcon>
  );
}

// Solar primitives (sidebar + shared)
export {
  AltArrowDown,
  AltArrowLeft,
  AltArrowRight,
  AltArrowUp,
  Bag,
  Bell,
  Bolt,
  Box,
  Card,
  ChatRound,
  ChatSquare,
  CheckCircle,
  CloseCircle,
  DangerTriangle,
  Database,
  Delivery,
  DiplomaVerified,
  Dollar,
  Gift,
  HamburgerMenu,
  HandShake,
  Help,
  HomeSmile,
  Letter,
  Logout,
  MagicStick3,
  MapPoint,
  Refresh,
  Scale,
  Settings,
  Shop,
  SortVertical,
  SquareArrowRightUp,
  Tag,
  TestTube,
  VerifiedCheck,
  Widget,
};

// Lucide-named aliases
export const Activity = Pulse;
export const AlertCircle = DangerCircle;
export const AlertTriangle = DangerTriangle;
export { Archive };
export const ArrowDown = AltArrowDown;
export const ArrowDownRight = SquareArrowRightDown;
export const ArrowLeft = AltArrowLeft;
export const ArrowRight = AltArrowRight;
export const ArrowUp = AltArrowUp;
export const ArrowUpDown = SortVertical;
export const ArrowUpRight = SquareArrowRightUp;
export const AudioLines = Soundwave;
export const Ban = ForbiddenCircle;
export const BarChart3 = Chart;
export const Beaker = TestTube;
export const Bike = KickScooter;
export const BookOpen = Book;
export const Bot = Ghost;
export const Building2 = Buildings2;
export const CalendarDays = CalendarDate;
export { Camera };
export const Check = ListCheck;
export const CheckCheck = CheckRead;
export const CheckCircle2 = CheckCircle;
export const ChevronDown = AltArrowDown;
export const ChevronLeft = AltArrowLeft;
export const ChevronRight = AltArrowRight;
export const ChevronUp = AltArrowUp;
export const ChevronsUpDown = SortVertical;
export const CircleDot = RecordCircle;
export const Clock = ClockCircle;
export const Clock3 = ClockCircle;
export { Compass };
export { Copy };
export const CreditCard = Card;
export { Crown };
export const DollarSign = Dollar;
export const Dot = RecordCircle;
export { Download };
export const Edit = Pen;
export const Edit2 = Pen2;
export const Edit3 = PenNewSquare;
export const ExternalLink = SquareArrowRightUp;
export { Eye };
export const EyeOff = EyeClosed;
export const FileEdit = PenNewSquare;
export const FileSpreadsheet = DocumentText;
export { FileText };
export { Filter };
export { Folder };
export const FolderPlus = AddFolder;
export const GalleryHorizontal = Gallery;
export const Globe = Globus;
export const GripVertical = HamburgerMenu;
export const HelpCircle = Help;
export { History };
export const Home = HomeSmile;
export const Image = Gallery;
export const ImageIcon = Gallery;
export const ImageOff = GalleryRemove;
export const ImagePlus = GalleryAdd;
export const Images = Gallery;
export { Inbox };
export { Layers };
export const LayoutGrid = Widget;
export const LifeBuoy = Help;
export const LineChart = Graph;
export const LineChartIcon = Graph;
export const ListChecks = Checklist;
export const ListFilter = Filter;
export const ListOrdered = List;
export const ListTree = ClipboardList;
export { Lock };
export const Mail = Letter;
export const MailPlus = InboxIn;
export const MailQuestionMark = QuestionCircle;
export const MapPin = MapPoint;
export const Maximize2 = Maximize;
export const Megaphone = VolumeLoud;
export const MessageCircle = ChatRound;
export const MessageSquare = ChatRound;
export const MessageSquarePlus = WidgetAdd;
export const Minimize2 = Minimize;
export const Minus = MinusCircle;
export { Monitor };
export { Moon };
export const MoreHorizontal = MenuDots;
export const MousePointerClick = Cursor;
export const Package = Box;
export const PackageOpen = Box;
export const PackageX = CloseCircle;
export { Palette };
export const PenLine = Pen;
export const Pencil = Pen2;
export { Phone };
export const PhoneMissed = PhoneCalling;
export { Play };
export const Plus = AddCircle;
export { Power };
export const PowerOff = Power;
export { Printer };
export const ReceiptText = BillList;
export const RefreshCcw = Restart;
export const RefreshCw = Refresh;
export const RotateCcw = Restart;
export const RotateCw = Refresh;
export { Route };
export const Rows3 = List;
export const Save = Diskette;
export const Scan = Scanner;
export const ScanSearch = Magnifer;
export const Search = Magnifer;
export const Send = Plain;
export const Settings2 = Tuning2;
export { Shield };
export { ShieldCheck };
export const ShoppingBag = Bag;
export const SkipForward = SkipNext;
export const SlidersHorizontal = SliderHorizontal;
export { Smartphone };
export const Sparkles = MagicStick3;
export const Square = Stop;
export { Star };
export { StopCircle };
export const Store = Shop;
export { Sun };
export const Table2 = Widget;
export const Tags = Hashtag;
export { Target };
export const ThumbsDown = Dislike;
export const ThumbsUp = Like;
export { Ticket };
export const Timer = ClockCircle;
export const Trash2 = TrashBinTrash;
export const TrendingDown = GraphDown;
export const Truck = Delivery;
export const Type = Text;
export const Undo2 = UndoLeft;
export { Upload };
export { User };
export const UserX = UserCross;
export const Users = UsersGroupRounded;
export const Wand2 = MagicStick3;
export const Wrench = Tuning2;
export const X = CloseSquare;
export const XCircle = CloseCircle;
export const Zap = Bolt;
export const ZoomIn = MagniferZoomIn;

// Marketplace / product-page aliases
export { Armchair, Heart, Laptop, Leaf, Lightbulb };
export const Award = MedalStar;
export const BadgeCheck = VerifiedCheck;
export const Calendar = CalendarDate;
export const Cog = Settings;
export const Disc = Record;
export const Disc3 = RecordCircle;
export const Frame = VideoFrame;
export const Gauge = Chart;
export const Grid = Widget;
export const Grid2x2 = Widget2;
export const Grid3X3 = Widget3;
export const Grid3x2 = Widget4;
export const Grip = MenuDots;
export const Hand = HandShake;
export const Headset = HeadphonesRound;
export const Info = InfoCircle;
export const LayoutList = List;
export const Link2 = Link;
export const LogOut = Logout;
export const Medal = MedalRibbon;
export const Menu = HamburgerMenu;
export const Merge = RoundTransferHorizontal;
export const Navigation = StreetsNavigation;
export const PanelLeft = Sidebar;
export const PanelLeftClose = SidebarMinimalistic;
export { PanelRightClose, PanelRightOpen } from "lucide-react";
export const Share2 = ShareCircle;
export const Shirt = TShirt;
export const ShoppingCart = Cart;
export const TrendingUp = GraphUp;
export const XIcon = X;

// Additional named solar exports
export {
  AddCircle,
  AddFolder,
  Banknote,
  Bill,
  Chart2,
  ChatLine,
  Checklist,
  CheckRead,
  ClipboardList,
  ClockCircle,
  CloseSquare,
  Cpu,
  Document,
  DocumentText,
  EyeClosed,
  ForbiddenCircle,
  Gallery,
  GalleryAdd,
  Ghost,
  Globus,
  Graph,
  GraphDown,
  GraphUp,
  InboxIn,
  InfoCircle,
  KickScooter,
  LetterOpened,
  List,
  ListCheck,
  Magnifer,
  Mailbox,
  MenuDots,
  MinusCircle,
  Pen,
  Pen2,
  PenNewSquare,
  Plain,
  PlayCircle,
  Pulse,
  QuestionCircle,
  RecordCircle,
  Restart,
  SendSquare,
  Soundwave,
  SquareArrowRightDown,
  Stop,
  Text,
  TrashBinTrash,
  Tuning2,
  UndoLeft,
  UserBlock,
  UserCross,
  UsersGroupRounded,
  VolumeLoud,
  WidgetAdd,
  FolderOpen,
  Link,
  DangerCircle,
};
