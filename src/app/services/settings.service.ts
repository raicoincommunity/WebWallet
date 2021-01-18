import { Injectable } from '@angular/core';
import { LocalStorageService, StorageKey, AppStorageEvent } from './local-storage.service';
import { U128 } from './util.service';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private autoReceiveSetting = new AutoReceiveSetting();
  private lockMimutes = 30;

  private globalSubject = new Subject<any>();
  public globalSettingChange$ = this.globalSubject.asObservable();

  constructor(private storage: LocalStorageService) { 
    this.loadGlobalSetting();
    this.storage.changes$.subscribe(event => this.processStorageEvent(event));
  }

  getAutoReceive(): AutoReceiveSetting {
    return this.autoReceiveSetting;
  }

  setAutoReceive(setting: AutoReceiveSetting) {
    this.autoReceiveSetting = setting;
    this.saveGlobalSetting();
  }

  getLockMinutes() {
    return this.lockMimutes;
  }

  setLockMinutes(minutes: number) {
    this.lockMimutes = minutes;
    this.saveGlobalSetting();
  }

  loadGlobalSetting() {
    let settings = this.storage.get(StorageKey.GLOBAL_SETTINGS);
    if (!settings) return;
    if (settings.auto_receive) {
      this.autoReceiveSetting.enable = settings.auto_receive.enable;
      this.autoReceiveSetting.minimum = new U128(settings.auto_receive.minimum);
    }
    if (settings.hasOwnProperty('lock_minutes')) {
      this.lockMimutes = settings.lock_minutes;
    }
  }

  saveGlobalSetting() {
    let settings: any = {
      auto_receive: {
        enable: this.autoReceiveSetting.enable,
        minimum: this.autoReceiveSetting.minimum.toDec()
      },
      lock_minutes: this.lockMimutes
    };

    this.storage.set(StorageKey.GLOBAL_SETTINGS, settings);
  }

  private processStorageEvent(event: AppStorageEvent) {
    if (event.self) return;
    if (event.key === StorageKey.GLOBAL_SETTINGS) {
      this.loadGlobalSetting();
      this.globalSubject.next();
    }
    else {
    }
  }  
}

export class AutoReceiveSetting {
  enable: boolean = true;
  minimum: U128 = U128.RAI.idiv(10);
}
