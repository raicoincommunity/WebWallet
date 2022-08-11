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
  private lockMimutes = 0;
  private lang = '';
  private assets: {[account: string]: AssetSetting[]} = {};
  private autoSwap: {[account: string]: boolean} = {};
  private hideCompletedOrders: {[account: string]: boolean} = {};

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
      // only set checked translations by default
      translate.use(browserLang.match(/en|id|vi|zh/) ? browserLang : 'en');
    }
    this.loadAssetsSetting();
    this.loadAutoSwapSetting();
    this.loadHideCompletedOrdersSetting();
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

  addAsset(account: string, asset: AssetSetting) {
    if (!this.assets[account]) {
      this.assets[account] = [];
    }
    const index = this.assets[account].findIndex(x => asset.eq(x));
    if (index !== -1) {
      this.assets[account][index] = asset;
    } else {
      this.assets[account].push(asset);
    }
    this.saveAssetsSetting();
  }

  getAssets(account: string): AssetSetting[] {
    if (!this.assets[account]) {
      return [];
    }
    return this.assets[account];
  }

  getAsset(account: string, chain: string, address: string): AssetSetting | undefined {
    const assets = this.assets[account];
    if (!assets) return undefined;
    return assets.find(x => x.chain === chain && x.address === address);
  }

  hasAsset(account: string, chain: string, address: string): boolean {
    const assets = this.assets[account];
    if (!assets) return false;
    return assets.findIndex(x => x.chain === chain && x.address === address) !== -1;
  }

  setAutoSwap(account: string, enable: boolean) {
    this.autoSwap[account] = enable;
    this.saveAutoSwapSetting();
  }

  getAutoSwap(account: string): boolean | undefined {
    return this.autoSwap[account];
  }

  getHideCompletedOrders(account: string): boolean | undefined {
    return this.hideCompletedOrders[account];
  }

  setHideCompletedOrders(account: string, enable: boolean) {
    this.hideCompletedOrders[account] = enable;
    this.saveHideCompletedOrdersSetting();
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

  loadAssetsSetting() {
    let assets = this.storage.get(StorageKey.ASSETS);
    if (!assets) return;
    this.assets = assets;
  }

  saveAssetsSetting() {
    this.storage.set(StorageKey.ASSETS, this.assets);
  }

  loadAutoSwapSetting() {
    const autoSwap = this.storage.get(StorageKey.AUTO_SWAP);
    if (!autoSwap) return;
    this.autoSwap = autoSwap;
  }

  saveHideCompletedOrdersSetting() {
    this.storage.set(StorageKey.HIDE_COMPLETED_ORDERS, this.hideCompletedOrders);
  }

  loadHideCompletedOrdersSetting() {
    const hideCompletedOrders = this.storage.get(StorageKey.HIDE_COMPLETED_ORDERS);
    if (!hideCompletedOrders) return;
    this.hideCompletedOrders = hideCompletedOrders;
  }

  saveAutoSwapSetting() {
    this.storage.set(StorageKey.AUTO_SWAP, this.autoSwap);
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

export class AssetSetting {
  chain: string = '';
  address: string = '';
  name: string = '';
  symbol: string = '';
  decimals: string = '';
  type: string = '';
  
  constructor(_chain: string, _address: string, _name: string, _symbol: string,
    _decimals: string, _type?: string) {
    this.chain = _chain;
    this.address = _address;
    this.name = _name;
    this.symbol = _symbol;
    this.decimals = _decimals;
    this.type = _type || '';
  }

  eq(other: AssetSetting): boolean {
    return this.chain === other.chain && this.address === other.address;
  }

}
