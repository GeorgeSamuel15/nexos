import type { ReactNode } from 'react';
import {
  Activity,
  AppWindow,
  Bot,
  Calculator,
  Clock3,
  Command,
  Cpu,
  File,
  FileText,
  Folder,
  HardDrive,
  Image,
  NotebookPen,
  Package,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Timer,
  type LucideProps,
} from 'lucide-react';

const icons: Readonly<Record<string, (properties: LucideProps) => ReactNode>> = {
  activity: (properties) => <Activity {...properties} />,
  calculator: (properties) => <Calculator {...properties} />,
  command: (properties) => <Command {...properties} />,
  cpu: (properties) => <Cpu {...properties} />,
  file: (properties) => <File {...properties} />,
  'file-text': (properties) => <FileText {...properties} />,
  folder: (properties) => <Folder {...properties} />,
  image: (properties) => <Image {...properties} />,
  nexos: (properties) => <Sparkles {...properties} />,
  notebook: (properties) => <NotebookPen {...properties} />,
  package: (properties) => <Package {...properties} />,
  search: (properties) => <Search {...properties} />,
  settings: (properties) => <Settings {...properties} />,
  sparkles: (properties) => <Bot {...properties} />,
  terminal: (properties) => <Terminal {...properties} />,
  timer: (properties) => <Timer {...properties} />,
  clock: (properties) => <Clock3 {...properties} />,
  drive: (properties) => <HardDrive {...properties} />,
  app: (properties) => <AppWindow {...properties} />,
};

export function AppIcon({ name, size = 22, ...properties }: LucideProps & { name: string }) {
  const Icon = icons[name] ?? icons['app'];
  return Icon ? Icon({ size, strokeWidth: 1.8, ...properties }) : null;
}
