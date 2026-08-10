export interface FileNavigationPort {
  open(path: string, newPane: boolean): Promise<void>;
}
