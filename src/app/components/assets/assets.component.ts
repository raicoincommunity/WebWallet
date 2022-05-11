import { Component, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import { Subject} from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TokenService, TokenInfo, AccountTokenInfo } from '../../services/token.service';
import { WalletsService } from '../../services/wallets.service';
import { environment } from '../../../environments/environment';
import { U8, U256, ChainHelper, TokenType, TokenHelper, TokenTypeStr } from '../../services/util.service';
import { LogoService } from '../../services/logo.service';
import { AssetSetting, SettingsService } from '../../services/settings.service'
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { NotificationService } from '../../services/notification.service';
import { AliasService } from '../../services/alias.service';

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
  tokenDecimals = new U8();
  tokenType = '';
  detail: AssetInfo | null = null;
  private dnsRegexp = /^[a-z0-9][a-z0-9-\.]{0,252}$/i;


  private tokenAddressSubject = new Subject<string>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private wallets: WalletsService,
    private token: TokenService,
    private logo: LogoService,
    private alias: AliasService,
    private settings: SettingsService,
    private translate: TranslateService,
    private notification: NotificationService
  ) { }

  ngOnInit(): void {
    const add = this.route.snapshot.queryParams.add;
    if (add) {
      this.activePanel = 'add_asset';
    }

    const assets = this.settings.getAssets(this.address());
    for (let asset of assets) {
      if (!this.token.tokenInfo(asset.chain, asset.address)) {
        this.token.queryTokenInfo(asset.chain, asset.address);
      }
      if (ChainHelper.isRaicoin(asset.chain)) {
        this.alias.addAccount(asset.address);
      }
    }

    this.tokenAddressSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe(
      _ => { this.syncTokenAddress(); });

    this.token.tokenInfo$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      if (result.existing) {
        const info = result.info;
        if (!info) return;
        this.tokenAddressStatus = 1;
        this.tokenSymbol = info.symbol;
        this.tokenName = info.name;
        this.tokenDecimals = info.decimals;
        this.tokenType = TokenHelper.toTypeStr(info.type);
      } else {
        this.tokenAddressStatus = 2;
        this.tokenSymbol = '';
        this.tokenName = '';
        this.tokenDecimals = new U8(0);
        this.tokenType= '';
      }
    });
  }

  tokens(): AssetInfo[] {
    let result: AssetInfo[] = [];
    const rai = new AssetInfo();
    rai.chain = '';
    rai.asset = 'Raicoin';
    const value = new U256(this.wallets.balance().value);
    rai.balance = value.toBalanceStr(new U8(9));
    rai.chainLogo = this.logo.getChainLogo(environment.current_chain);
    rai.tokenLogo = this.logo.getTokenLogo(environment.current_chain, '');
    rai.isRaicoin = true;
    result.push(rai);

    const custom: AssetInfo[] = [];
    for (let i of this.settings.getAssets(this.address())) {
      const item =  new AssetInfo();
      item.chain = i.chain;
      item.address = i.address;
      item.asset = i.symbol;
      item.chainShown = ChainHelper.toChainShown(i.chain);
      const decimals = new U8(i.decimals);
      item.balance = this.token.balance(i.chain, i.address).amount.toBalanceStr(decimals);
      item.chainLogo = this.logo.getChainLogo(i.chain);
      const ret  = ChainHelper.addressToRaw(i.chain, i.address);
      if (ret.error || !ret.raw || !ret.raw.isNativeTokenAddress()) {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, i.address);
      } else {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, i.address);
      }
      custom.push(item);
      if (ChainHelper.isRaicoin(item.address)) {
        this.alias.addAccount(item.address);
      }
    }
    result = result.concat(custom);

    for (let i of this.token.tokens()) {
      const existing = custom.find(x => x.chain === i.chain && x.address == i.address);
      if (existing) continue;
      const item = new AssetInfo();
      item.chain = i.chain;
      item.address = i.address;
      item.asset = i.symbol;
      item.chainShown = i.chainShown;
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
    return ChainHelper.crossChainStrs(environment.current_chain);
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

      if (ChainHelper.isRaicoin(this.selectedChain)) {
        this.alias.addAccount(address);
      }

      const info = this.token.tokenInfo(address, this.selectedChain);
      if (info) {
        this.tokenSymbol = info.symbol;
        this.tokenName = info.name;
        this.tokenDecimals = info.decimals;
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

  cancel() {
    this.inputTokenAddress = '';
    this.activePanel = '';
  }

  addAsset() {
    this.syncTokenAddress();
    if (this.tokenAddressStatus !== 1) return;
    const asset = new AssetSetting(this.selectedChain, this.formatTokenAddress(),
                                   this.tokenName, this.tokenSymbol, this.tokenDecimals.toDec(), this.tokenType);
    this.settings.addAsset(this.wallets.selectedAccountAddress(), asset);
    this.token.syncAccount(this.wallets.selectedAccountAddress());
    this.activePanel = '';
    this.selectedChain = environment.current_chain;
    this.tokenAddressStatus = 0;
    this.inputTokenAddress = '';
    this.tokenAddressChanged();
    this.tokenSymbol = '';
    this.tokenName = '';
    this.tokenDecimals = new U8();
    this.tokenAddressSubject.next('');
  }

  domain(address: string): string {
    if (!address.startsWith('rai_')) return '';
    const domain = this.alias.dns(address);
    if (!domain) return '';
    if (!this.dnsRegexp.test(domain)) return '';
    if (!this.alias.verified(address)) return '';
    if (!this.alias.dnsValid(address)) return '';
    return domain;
  }

  showDetails(asset: AssetInfo) {
    if (asset.isRaicoin) {
      this.router.navigate([`/account/${this.address()}`]);
      return;
    };
    const info = this.token.tokenInfo(asset.address, asset.chain);
    if (!info) this.token.queryTokenInfo(asset.chain, asset.address);
    this.detail = asset;
    this.activePanel = 'asset_details';
  }

  address(): string {
    return this.wallets.selectedAccountAddress();
  }

  chain(): string {
    return this.detail?.chain || '';
  }

  chainShown(): string {
    return this.detail?.chainShown || '';
  }

  name(): string {
    const info = this.getInfo();
    return info.token?.name || info.account?.name || '';
  }

  symbol(): string {
    const info = this.getInfo();
    return info.token?.symbol || info.account?.symbol || '';
  }

  balance(): string {
    const balance = this.detail?.balance;
    if (!balance) return '';
    return `${balance} ${this.symbol()}`;
  }

  tokenAddress(): string {
    const info = this.getInfo();
    const address = info.token?.address || info.account?.address;
    if (!address) return '';
    if (ChainHelper.isNative(this.chain(), address)) {
      return 'N/A';
    }
    return address;
  }

  tokenAddressCopied() {
    let msg = marker(`Token address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  tokenIdUriCopied() {
    let msg = marker(`The URI copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  type(): string {
    const info = this.getInfo();
    let type: TokenType = TokenType.INVALID;
    if (info.token) {
      type = info.token.type;
    } else if (info.account) {
      type = info.account.type;
    } else {
      return '';
    }
    return TokenHelper.toTypeStr(type);
  }

  typeShown(): string {
    return ChainHelper.tokenTypeShown(this.chain(), this.type() as TokenTypeStr);
  }

  decimals(): string {
    const info = this.getInfo();
    return info.token?.decimals.toDec() || info.account?.decimals.toDec() || '';
  }

  baseUri(): string {
    if (this.type() !== TokenTypeStr._721) return '';
    const info = this.getInfo();
    return info.token?.baseUri || '';
  }

  totalSupply(): string {
    const info = this.getInfo();
    if (!info.token) return '';
    return info.token.totalSupply.toBalanceStr(info.token.decimals) + ' ' + info.token.symbol;
  }

  circulable(): string {
    const info = this.getInfo();
    if (!info.token) return '';
    return this.boolToString(info.token.circulable);
  }

  tokenIds(): TokenIdInfo[] {
    const result: TokenIdInfo[] = [];
    if (!this.detail) return result;
    const info = this.token.tokenInfo(this.detail.address, this.detail.chain);
    if (!info || info.type !== TokenType._721) return [];
    const ids = this.token.tokenIds(this.detail.chain, this.detail.address);
    for (let id of ids) {
      const item = new TokenIdInfo();
      item.id = id.id.toDec();
      item.uri = `${info.baseUri}${id.uri}`;
      result.push(item);
    }
    return result;
  }

  hasMoreTokenIds(): boolean {
    if (!this.detail) return false;
    const info = this.token.accountTokenInfo(this.detail.chain, this.detail.address);
    if (!info) return false;
    return info.hasMoreTokenIds();
  }

  loadMoreTokenIds() {
    if (!this.detail) return;
    const size = this.token.getTokenIdsSize(this.detail.chain, this.detail.address);
    this.token.setTokenIdsSize(this.detail.chain, this.detail.address, size + 10);
  }

  tokenDomain(): string {
    const address = this.formatTokenAddress();
    if (!address) return '';

    if (!ChainHelper.isRaicoin(this.selectedChain)) return '';
    return this.domain(address);
 }

  tokenDetailDomain(): string {
    if (!this.detail) return '';
    if (!ChainHelper.isRaicoin(this.detail.chain)) return '';
    return this.domain(this.detail.address);
  }

  private getInfo(): {token?: TokenInfo, account?: AccountTokenInfo} {
    const result: any = {};
    if (!this.detail) return result;
    result.token = this.token.tokenInfo(this.detail.address, this.detail.chain);
    result.account = this.token.accountTokenInfo(this.detail.chain, this.detail.address);
    return result;
  }

  private boolToString(bool: boolean): string {
    let msg = bool ? marker(`Yes`) : marker(`No`);
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

}

class AssetInfo {
  chain: string = '';
  address: string = '';
  asset: string = '';
  balance: string = '';
  chainShown: string = '';
  chainLogo: string = '';
  tokenLogo: string = '';
  isRaicoin: boolean = false;
}

class TokenIdInfo {
  id: string = '';
  uri: string = '';
}