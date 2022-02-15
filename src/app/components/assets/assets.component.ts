import { Component, OnInit } from '@angular/core';
import { Subject} from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TokenService, AccountTokenInfo } from '../../services/token.service';
import { WalletsService } from '../../services/wallets.service';
import { environment } from '../../../environments/environment';
import { U8, U256, ChainHelper, ChainStr, TokenHelper } from '../../services/util.service';
import { LogoService } from '../../services/logo.service';

@Component({
  selector: 'app-assets',
  templateUrl: './assets.component.html',
  styleUrls: ['./assets.component.css']
})
export class AssetsComponent implements OnInit {
  activePanel = '';
  selectedChain = environment.current_chain;
  tokenAddressStatus = 0;
  inputTokenAddress = '';
  tokenSymbol = '';
  tokenName = '';

  private tokenAddressSubject = new Subject<string>();

  constructor(
    private wallets: WalletsService,
    private token: TokenService,
    private logo: LogoService
  ) { }

  ngOnInit(): void {
    this.tokenAddressSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe(
      _ => { this.syncTokenAddress(); });

    this.token.tokenInfo$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      if (result.existing) {
        this.tokenAddressStatus = 1;
        console.log('!!!token info=', result.info);
        this.tokenSymbol = result.info!.symbol;
        this.tokenName = result.info!.name;
      } else {
        this.tokenAddressStatus = 2;
        this.tokenSymbol = '';
        this.tokenName = '';
      }
    });
  }

  tokens(): AssetInfo[] {
    const result: AssetInfo[] = [];
    const rai = new AssetInfo();
    rai.chain = '';
    rai.asset = 'Raicoin';
    const value = new U256(this.wallets.balance().value);
    rai.balance = value.toBalanceStr(new U8(9));
    rai.chainLogo = this.logo.getChainLogo(environment.current_chain);
    rai.tokenLogo = this.logo.getTokenLogo(environment.current_chain, '');

    result.push(rai);
    for (let i of this.token.tokens()) {
      const item = new AssetInfo();
      item.asset = i.symbol;
      item.chain = i.chainShown;
      item.balance = i.balance.toBalanceStr(i.decimals);
      item.chainLogo = this.logo.getChainLogo(i.chain);
      if (i.addressRaw.isNativeTokenAddress()) {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, '');
      } else {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, i.address);
      }
      result.push(item);
    }

    return result;
  }

  empty(): boolean {
    return this.tokens().length === 0;
  }

  chains(): string[] {
    const arr = ChainHelper.crossChainStrs(environment.current_chain);
    if (environment.current_chain === ChainStr.RAICOIN) {
      arr.splice(0, 0, ChainStr.RAICOIN);
    } else {
      arr.splice(0, 0, ChainStr.RAICOIN_TEST);
    }
    return arr;
  }

  showChain(chain: string): string {
    return ChainHelper.toChainShown(chain);
  }

  chainChanged(selected: string) {
    if (!selected) return;
    this.syncTokenAddress();
  }

  tokenAddressChanged() {
    this.tokenAddressSubject.next(this.inputTokenAddress);
  }

  syncTokenAddress() {
    if (!this.inputTokenAddress) {
      this.tokenAddressStatus = 0;
      return;
    }

    try {
      const address = this.formatTokenAddress();
      if (!address) {
        this.tokenAddressStatus = 2;
        return;
      }

      const info = this.token.tokenInfo(address, this.selectedChain);
      if (info) {
        this.tokenSymbol = info.symbol;
        this.tokenName = info.name;
        this.tokenAddressStatus = 1;
      } else {
        this.token.queryTokenInfo(this.selectedChain, address);
        this.tokenAddressStatus = 3;
      }
    } catch (err) {
      this.tokenAddressStatus = 2;
    }
  }

  formatTokenAddress(): string {
    const retRaw = ChainHelper.addressToRaw(this.selectedChain, this.inputTokenAddress);
    if (retRaw.error || !retRaw.raw) {
      return '';
    }
    const retAddress = ChainHelper.rawToAddress(this.selectedChain, retRaw.raw);
    if (retAddress.error || !retAddress.address) return '';
    return retAddress.address;
}

}

class AssetInfo {
  asset: string = '';
  balance: string = '';
  chain: string = '';
  chainLogo: string = '';
  tokenLogo: string = '';
}