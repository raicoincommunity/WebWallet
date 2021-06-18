import { Injectable, OnDestroy} from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService implements OnDestroy {
  private subject = new Subject<AppStorageEvent>();
  public changes$ = this.subject.asObservable();

  constructor() {
    this.onStore  = this.onStore.bind(this);
    this.start();
  }

  ngOnDestroy() {
    this.stop();
  }

  public get(key: StorageKey): any {
    return this.parseValue(localStorage.getItem(key));
  }

  public getAll() {
    let s = [];
    for (let i = 0; i < localStorage.length; i++) {
      let k = localStorage.key(i)!;
      let v = this.parseValue(localStorage.getItem(k));
      if (v === undefined) {
        continue;
      }
      s.push({ key: k, value: v });
    }
    return s;
  }

  public set(key: StorageKey, value: any): void {
    let itemOld = localStorage.getItem(key);
    let itemNew = JSON.stringify(value);
    if (itemOld === itemNew)
    {
      return;
    }

    localStorage.setItem(key, itemNew);
    this.subject.next(new AppStorageEvent(true, key, value));
  }

  public clear(key: StorageKey) {
    let itemOld = localStorage.getItem(key);
    if (itemOld === null)
    {
      return;
    }

    localStorage.removeItem(key);
    this.subject.next(new AppStorageEvent(true, key, null));
  }

  private parseValue(value: string | null) : any
  {
    let result;
    try {
      result = value === null ? null : JSON.parse(value);
    }
    catch (e) {
      console.log('Failed to parse local storage value:', value);
      return undefined;
    }

    return result;
  }

  private start(): void {
    window.addEventListener('storage', this.onStore);
  }

  private onStore(event: StorageEvent) {
    if (event.storageArea == localStorage) {
      let v = this.parseValue(event.newValue);
      if (v === undefined)
      {
        return;
      }

      if (typeof event.key === 'string') {
        this.subject.next(new AppStorageEvent(false, event.key, v));
      }
    }
  }

  private stop(): void {
    window.removeEventListener('storage', this.onStore);
    this.subject.complete();
  }
}

export enum StorageKey {
  UNLOCKED = 'unlocked',
  WALLETS = 'wallets',
  GLOBAL_SETTINGS = 'global_settings',
  WALLETCONNECT_DEEPLINK_CHOICE = 'WALLETCONNECT_DEEPLINK_CHOICE',
  WALLET_CONNECT = 'walletconnect',
  WEB3_CONNECT_CACHED_PROVIDER = 'WEB3_CONNECT_CACHED_PROVIDER'
}

export class AppStorageEvent{
  self: boolean;
  key: string;
  value: any;

  constructor (self: boolean, key: string, value: any) {
    this.self = self;
    this.key = key;
    this.value = value;
  }
}
