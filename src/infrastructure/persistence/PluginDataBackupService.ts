import type { SessionBackup } from "./SerialPersistenceCoordinator";
import type { PluginDataResetBackup } from "../../application/ports/PluginDataPort";

export interface PluginDataBackupStorage {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

const timestampForFile = (date: Date): string =>
  date.toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace("Z", "")
    .replace(".", "-");

export class PluginDataBackupService implements SessionBackup, PluginDataResetBackup {
  private needsSessionBackup = false;

  public constructor(
    private readonly storage: PluginDataBackupStorage,
    private readonly dataPath: string,
    private readonly now: () => Date
  ) {}

  public beginSession(hasExistingValidData: boolean): void {
    this.needsSessionBackup = hasExistingValidData;
  }

  public async ensureSessionBackup(): Promise<void> {
    if (!this.needsSessionBackup) {
      return;
    }
    const source = await this.storage.read(this.dataPath);
    await this.storage.write(this.pathBesideData("data.backup.json"), source);
    this.needsSessionBackup = false;
  }

  public async createTimestampedBackup(): Promise<string> {
    const source = await this.storage.read(this.dataPath);
    const backupPath = this.pathBesideData(
      `data.backup-${timestampForFile(this.now())}.json`
    );
    await this.storage.write(backupPath, source);
    return backupPath;
  }

  private pathBesideData(fileName: string): string {
    const separatorIndex = this.dataPath.lastIndexOf("/");
    return separatorIndex === -1
      ? fileName
      : `${this.dataPath.slice(0, separatorIndex)}/${fileName}`;
  }
}
