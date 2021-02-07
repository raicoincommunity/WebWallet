import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LocalStorageService, StorageKey, AppStorageEvent } from './local-storage.service';
import { U128 } from './util.service';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private autoReceiveSetting = new AutoReceiveSetting();
  private lockMimutes = 30;
  private lang = '';

  private globalSubject = new Subject<any>();
  public globalSettingChange$ = this.globalSubject.asObservable();

  constructor(
    private translate: TranslateService,
    private storage: LocalStorageService) { 
    this.loadGlobalSetting();
    translate.addLangs(['en', 'es', 'fr', 'id', 'ru', 'vi', 'zh']);
    translate.setDefaultLang('en');
    if (this.lang) {
      translate.use(this.lang);
    }
    else {
      const browserLang = translate.getBrowserLang();
      translate.use(browserLang.match(/en|es|fr|id|ru|vi|zh/) ? browserLang : 'en');
      console.log(browserLang);
      console.log(translate.currentLang);
    }
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

  setLang(lang: string) {
    this.lang = lang;
    this.translate.use(lang);
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

    if (settings.hasOwnProperty('lang')) {
      this.lang = settings.lang;
    }
  }

  saveGlobalSetting() {
    let settings: any = {
      auto_receive: {
        enable: this.autoReceiveSetting.enable,
        minimum: this.autoReceiveSetting.minimum.toDec()
      },
      lock_minutes: this.lockMimutes,
      lang: this.lang
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
  minimum: U128 = U128.RAI().idiv(10);
}
