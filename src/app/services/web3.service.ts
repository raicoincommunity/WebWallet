import { Injectable, OnDestroy } from '@angular/core';
import { IProviderControllerOptions } from '@mindsorg/web3modal-ts';
import { Web3ModalService } from '@mindsorg/web3modal-angular';
import Web3 from 'web3';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { AbiItem } from 'web3-utils';
import { Subject } from 'rxjs';
import WalletConnectProvider from "@walletconnect/web3-provider";

import ABI_BSC from '../abi/bsc.json';
import ABI_EVM_CHAIN_CORE from '../abi/evm_chain_core.json';
import ABI_ERC20 from '../abi/erc20.json';
import ABI_ERC721 from '../abi/erc721.json';
import { environment } from '../../environments/environment';
import { NotificationService } from './notification.service';
import { LocalStorageService, StorageKey } from './local-storage.service';
import { ChainHelper, ChainStr, Chain } from './util.service';

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider, // required
    options: {
      rpc: environment.rpc_options,
      bridge: 'https://pancakeswap.bridge.walletconnect.org/',
    },
  }
};

type EvmChainNetworkMap = [Chain, string, number];
const evmChainNetworkMaps: EvmChainNetworkMap[] = [
  [Chain.ETHEREUM, 'mainnet', 1],
  [Chain.BINANCE_SMART_CHAIN, 'binance', 56],

  [Chain.ETHEREUM_TEST_GOERLI, 'goerli', 5],
  [Chain.BINANCE_SMART_CHAIN_TEST, 'binance-testnet', 97],
];

@Injectable({
  providedIn: 'root'
})
export class Web3Service implements OnDestroy {
  public accounts: any = [];
  public web3: Web3 | null = null;
  public provider: any = null;
  public bscContract: any = null;
  public evmCoreContract: any = null;
  public chainId = 0;
  public chainStr = '';

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
    console.log('Web3Service destroyed!');
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

  async connectWallet(chainStr?: ChainStr): Promise<any> {
    if (!chainStr) {
      chainStr = environment.bsc_chain as ChainStr;
    }
    if (this.connected() && this.chainStr === chainStr) {
      return;
    }
    await this.disconnectWallet();
    try {
      const options = Web3Service.providerControllerOptions(chainStr);
      if (options === null) {
        console.error('No provider controller options for ', chainStr);
        return;
      }
      this.web3ModalService.setConfiguration(options);
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
    this.chainId = await this.web3.eth.getChainId();
    if (this.chainId != Web3Service.getChainNetworkId(chainStr)) {
      await this.disconnectWallet();
      let msg = marker(`Your wallet does not support { chainShown } or not working on it now`);
      const param = { 'chainShown': ChainHelper.toChainShown(chainStr) };
      this.translate.get(msg, param).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    this.chainStr = chainStr;

    this.prev_account = this.account();
    this.accounts = await this.web3.eth.getAccounts();
    if (!this.accounts || this.accounts.length == 0) {
      await this.disconnectWallet();
      return;
    }

    if (chainStr === environment.bsc_chain) {
      this.bscContract = new this.web3.eth.Contract((ABI_BSC as unknown) as AbiItem, environment.bsc_contract_address);
    }

    const coreAddress = Web3Service.getCoreContractAddress(chainStr);
    if (coreAddress) {
      this.evmCoreContract = new this.web3.eth.Contract((ABI_EVM_CHAIN_CORE as unknown) as AbiItem, coreAddress);
    } else {
      await this.disconnectWallet();
      this.evmCoreContract = null;
      console.error('No core contract address for ', chainStr);
      return;
    }
    this.notify();
  }

  async disconnectWallet(): Promise<any> {
    if (this.provider) {
      if (this.provider.disconnect) {
        try {
          this.provider.disconnect();
        } catch (err) {
          console.error('Failed to disconnect provider,', err);
        }
      }

      if (this.provider.close) {
        try {
          await this.provider.close();
        } catch (err) {
          console.error('Failed to close provider,', err);
        }
      }

      if (this.provider.clearCachedProvider) {
        try {
          await this.provider.clearCachedProvider();
        } catch (err) {
          console.error('Failed to clear cached provider,', err);
        }
      }
    }

    this.web3 = null;
    this.provider = null;
    this.prev_account = this.account();
    this.accounts = [];
    this.bscContract = null;
    this.evmCoreContract = null;
    this.chainId = 0;
    this.chainStr = '';
    this.storage.clear(StorageKey.WALLETCONNECT_DEEPLINK_CHOICE);
    this.storage.clear(StorageKey.WALLET_CONNECT);
    this.storage.clear(StorageKey.WEB3_CONNECT_CACHED_PROVIDER);
    this.notify();
  }

  connected(chainStr?: ChainStr): boolean {
    if (!this.accounts || this.accounts.length == 0) return false;
    if (!this.web3 || !this.provider || !this.evmCoreContract) return false;
    if (!chainStr) {
      chainStr = environment.bsc_chain as ChainStr;
    }
    if (this.chainStr != chainStr) return false;

    return true;
  }

  makeErc20Contract(address: string): any {
    if (!this.web3) return null;
    return new this.web3.eth.Contract((ABI_ERC20 as unknown) as AbiItem, address);
  }

  makeErc721Contract(address: string): any {
    if (!this.web3) return null;
    return new this.web3.eth.Contract((ABI_ERC721 as unknown) as AbiItem, address);
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

  static getChainNetwork(chainStr: ChainStr): string {
    const chain = ChainHelper.toChain(chainStr);
    const map = evmChainNetworkMaps.find(x => chain === x[0]);
    if (!map) return '';
    return map[1];
  }

  static getChainNetworkId(chainStr: ChainStr): number {
    const chain = ChainHelper.toChain(chainStr);
    const map = evmChainNetworkMaps.find(x => chain === x[0]);
    if (!map) return 0;
    return map[2];
  }

  static providerControllerOptions(chainStr: ChainStr): IProviderControllerOptions | null {
    const network = Web3Service.getChainNetwork(chainStr);
    if (!network) return null;
    return {
      network, // optional
      cacheProvider: false, // optional
      providerOptions, // required
      disableInjectedProvider: false
    };
  }

  static getCoreContractAddress(chainStr: ChainStr): string {
    for (let i of environment.cross_chain) {
      if (i.chain === chainStr) {
        return i.contract;
      }
    }
    return '';
  }

}
