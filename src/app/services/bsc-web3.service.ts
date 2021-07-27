import { Injectable, OnDestroy } from '@angular/core';
import { Web3ModalService } from '@mindsorg/web3modal-angular';
import Web3 from 'web3';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { AbiItem } from 'web3-utils';
import { Subject } from 'rxjs';

import ABI_BSC from '../abi/bsc.json';
import { environment } from '../../environments/environment';
import { NotificationService } from './notification.service';
import { LocalStorageService, StorageKey } from './local-storage.service'

@Injectable({
  providedIn: 'root'
})
export class BscWeb3Service implements OnDestroy {
  public accounts: any = [];
  public web3: Web3 | null = null;
  public provider: any = null;
  public contract: any = null;

  private accountSubject = new Subject<{from: string; to:string}>();
  private prev_account = '';

  public accountChanged$ = this.accountSubject.asObservable();

  constructor(
    private translate: TranslateService,
    private web3ModalService: Web3ModalService,
    private storage: LocalStorageService,
    private notification: NotificationService
  ) { }

  ngOnDestroy():void {
    this.disconnectWallet().then(_ => {}).catch(_ => {});
    console.log('BscWeb3Service destroyed!');
  }

  account(): string {
    if (this.accounts && this.accounts.length) {
      return this.accounts[0];
    }

    return '';
  }

  notify() {
    if (this.prev_account === this.account()) return;
    this.accountSubject.next({from:this.prev_account, to:this.account()});
  }

  async connectWallet(): Promise<any> {
    await this.disconnectWallet();
    try {
      this.provider = await this.web3ModalService.open();
      if (!this.provider) {
        let msg = marker(`Failed to connect your web3 wallet, please try again`);
        this.translate.get(msg).subscribe(res => msg = res);      
        this.notification.sendError(msg);
        return;
      }
    }
    catch {
      let msg = marker(`Failed to connect your web3 wallet, please try again`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }
    this.watchProvider();
    
    this.web3 = new Web3(this.provider);
    const chainId = await this.web3.eth.getChainId();
    if (chainId != environment.bsc_chain_id) {
      await this.disconnectWallet();
      let msg = marker(`Your wallet does not support Binance Smart Chain or not working on it now`);
      this.translate.get(msg).subscribe(res => msg = res);      
      this.notification.sendError(msg);
      return;
    }

    this.prev_account = this.account();
    this.accounts = await this.web3.eth.getAccounts();
    this.notify();
    if (!this.accounts || this.accounts.length == 0) {
      await this.disconnectWallet();
      return;
    }

    this.contract = new this.web3.eth.Contract((ABI_BSC as unknown) as AbiItem, environment.bsc_contract_address);
  }

  async disconnectWallet(): Promise<any> {
    if (this.provider) {
      if (this.provider.close) {
        await this.provider.close();
      }

      if (this.provider.clearCachedProvider) {
        await this.provider.clearCachedProvider();
      }

      if (this.provider.disconnect) {
        this.provider.disconnect();
      }
    }

    this.provider = null;
    this.prev_account = this.account();
    this.accounts = [];
    this.web3 = null;
    this.contract = null;
    this.storage.clear(StorageKey.WALLETCONNECT_DEEPLINK_CHOICE);
    this.storage.clear(StorageKey.WALLET_CONNECT);
    this.storage.clear(StorageKey.WEB3_CONNECT_CACHED_PROVIDER);
    this.notify();
  }

  connected(): boolean {
    return this.accounts && this.accounts.length && !!this.web3
           && !!this.provider && this.contract;
  }

  watchProvider(): void {
    if (!this.provider) {
      return;
    }

    const provider = this.provider;
    this.provider.on("accountsChanged", (accounts: string[]) => {
      if (this.provider !== provider) {
        return;
      }
      this.prev_account = this.account();
      this.accounts = accounts;
      console.log('accountsChanged', accounts);
      this.notify();
      if (accounts.length === 0) {
        this.disconnectWallet().then(_ => {}).catch(_ => {});
      }
    });

    this.provider.on("chainChanged", (chainId: number) => {
      console.log('chainChanged', chainId);
      if (this.provider !== provider) {
        return;
      }    
      this.disconnectWallet().then(_ => {}).catch(_ => {});
    });

    this.provider.on("disconnect", (err: { code: number; message: string }) => {
      console.log('disconnect:', err.message);
      if (this.provider !== provider) {
        return;
      }    
      this.disconnectWallet().then(_ => {}).catch(_ => {});
    });
  }

}
