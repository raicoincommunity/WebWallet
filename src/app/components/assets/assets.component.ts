import { Component, OnInit, HostListener } from '@angular/core';
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
import { VerifiedTokensService } from '../../services/verified-tokens.service';

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
  tokenDecimals = 0;
  tokenDecimalsValid = false;
  tokenType = '';
  tokenWrapped?: boolean;
  detail: AssetInfo | null = null;
  private dnsRegexp = /^[a-z0-9][a-z0-9-\.]{0,252}$/i;

  private tokenAddressSubject = new Subject<string>();
  private chainsCache: string[] = [];
  private tokenInfoSubscription: any;
  private tokenSymbolSubscription: any;
  private tokenNameSubscription: any;
  private tokenTypeSubscription: any;
  private tokenDecimalsSubscription: any;
  private tokenWrappedSubscription: any;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private wallets: WalletsService,
    private token: TokenService,
    private logo: LogoService,
    private alias: AliasService,
    private settings: SettingsService,
    private verified: VerifiedTokensService,
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
        this.token.queryTokenInfo(asset.chain, asset.address, true);
      }
      if (ChainHelper.isRaicoin(asset.chain)) {
        this.alias.addAccount(asset.address);
      }
    }

    this.tokenAddressSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe(
      _ => { this.syncTokenAddress(); });

    this.tokenInfoSubscription = this.token.tokenInfo$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      if (result.existing) {
        const info = result.info;
        if (!info) return;
        this.tokenSymbol = this.queryTokenSymbol(info.chain, info.address, info.symbol);
        this.tokenName = this.queryTokenName(info.chain, info.address, info.name);
        this.tokenDecimals = info.decimals.toNumber();
        this.tokenDecimalsValid = true;
        this.tokenType = TokenHelper.toTypeStr(info.type);
        if (this.tokenInfoValid()) {
          this.tokenAddressStatus = 1;
        }
      } else {
        this.tokenAddressStatus = 2;
        this.tokenSymbol = '';
        this.tokenName = '';
        this.tokenDecimals = 0;
        this.tokenDecimalsValid = false;
        this.tokenType= '';
      }
    });

    this.tokenSymbolSubscription = this.token.tokenSymbol$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      this.tokenSymbol = result.symbol;
      if (this.tokenInfoValid()) {
        this.tokenAddressStatus = 1;
      }
    });

    this.tokenNameSubscription = this.token.tokenName$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      this.tokenName = result.name;
      if (this.tokenInfoValid()) {
        this.tokenAddressStatus = 1;
      }
    });

    this.tokenTypeSubscription = this.token.tokenType$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      if (result.type === TokenType.INVALID) {
        this.tokenType = '';
        this.tokenAddressStatus = 2;
        return;
      }
      this.tokenType = TokenHelper.toTypeStr(result.type);
      if (this.tokenInfoValid()) {
        this.tokenAddressStatus = 1;
      } else if (this.tokenType == TokenTypeStr._20 && this.tokenDecimals < 0) {
        this.tokenAddressStatus = 2;
      }
    });

    this.tokenDecimalsSubscription = this.token.tokenDecimals$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      this.tokenDecimals = result.decimals;
      this.tokenDecimalsValid = true;
      if (this.tokenInfoValid()) {
        this.tokenAddressStatus = 1;
      } else if (this.tokenType == TokenTypeStr._20 && this.tokenDecimals < 0) {
        this.tokenAddressStatus = 2;
      }
    });

    this.tokenWrappedSubscription = this.token.tokenWrapped$.subscribe(result => {
      if (result.chain !== this.selectedChain) return;
      if (result.address !== this.formatTokenAddress()) return;
      this.tokenWrapped = result.wrapped;
      if (this.tokenInfoValid()) {
        this.tokenAddressStatus = 1;
      } else if (this.tokenWrapped) {
        this.tokenAddressStatus = 2;
      }
    });
  }

  @HostListener('unloaded')
  ngOnDestroy() {
    if (this.tokenInfoSubscription) {
      this.tokenInfoSubscription.unsubscribe();
      this.tokenInfoSubscription = null;
    }

    if (this.tokenSymbolSubscription) {
      this.tokenSymbolSubscription.unsubscribe();
      this.tokenSymbolSubscription = null;
    }

    if (this.tokenNameSubscription) {
      this.tokenNameSubscription.unsubscribe();
      this.tokenNameSubscription = null;
    }

    if (this.tokenTypeSubscription) {
      this.tokenTypeSubscription.unsubscribe();
      this.tokenTypeSubscription = null;
    }

    if (this.tokenDecimalsSubscription) {
      this.tokenDecimalsSubscription.unsubscribe();
      this.tokenDecimalsSubscription = null;
    }

    if (this.tokenWrappedSubscription) {
      this.tokenWrappedSubscription.unsubscribe();
      this.tokenWrappedSubscription = null;
    }
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
      item.asset = this.queryTokenSymbol(i.chain, i.address, i.symbol);
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
      item.asset = this.queryTokenSymbol(i.chain, i.address, i.symbol);
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

  tokenInfoValid(): boolean {
    if (!this.tokenSymbol) return false;
    if (!this.tokenName) return false;
    if (!this.tokenType) return false;
    if (this.tokenType == TokenTypeStr._20 && !this.tokenDecimalsValid) return false;
    if (this.tokenWrapped !== false) return false;
    return true;
  }

  empty(): boolean {
    return this.tokens().length === 0;
  }

  chains(): string[] {
    if (this.chainsCache.length == 0) {
      this.chainsCache.push(environment.current_chain);
      this.chainsCache = this.chainsCache.concat(ChainHelper.crossChainStrs(true));
    }
    return this.chainsCache;
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

      const chain = this.selectedChain;
      if (ChainHelper.isRaicoin(this.selectedChain)) {
        this.alias.addAccount(address);
        const info = this.token.tokenInfo(address, chain);
        if (info) {
          this.tokenSymbol = this.queryTokenSymbol(info.chain, info.address, info.symbol);
          this.tokenName = info.name;
          this.tokenDecimals = info.decimals.toNumber();
          this.tokenDecimalsValid = true;
          this.tokenType = TokenHelper.toTypeStr(info.type);
          if (this.tokenInfoValid()) {
            this.tokenAddressStatus = 1;
          } else {
            this.tokenAddressStatus = 3;
          }
        } else {
          this.token.queryTokenInfo(chain, address, true);
          this.tokenAddressStatus = 3;
        }
      } else {
        this.tokenSymbol = this.queryTokenSymbol(chain, address, '');
        this.tokenName = this.queryTokenName(chain, address, '');
        this.tokenType = this.queryTokenType(chain, address, '');
        const decimals = this.queryTokenDecimals(chain, address);
        if (decimals !== undefined) {
          this.tokenDecimals = decimals;
          this.tokenDecimalsValid = true;
        }
        this.tokenWrapped = this.queryTokenWrapped(chain, address);
        if (this.tokenInfoValid()) {
          this.tokenAddressStatus = 1;
        } else {
          this.tokenAddressStatus = 3;
        }
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
    let decimals = '0';
    if (this.tokenType == TokenTypeStr._20) {
      decimals = `${this.tokenDecimals}`
    }
    const asset = new AssetSetting(this.selectedChain, this.formatTokenAddress(),
                                   this.tokenName, this.tokenSymbol, decimals,
                                   this.tokenType);
    this.settings.addAsset(this.wallets.selectedAccountAddress(), asset);
    this.token.syncAccount(this.wallets.selectedAccountAddress());
    this.activePanel = '';
    this.selectedChain = environment.current_chain;
    this.tokenAddressStatus = 0;
    this.inputTokenAddress = '';
    this.tokenAddressChanged();
    this.tokenSymbol = '';
    this.tokenName = '';
    this.tokenDecimals = 0;
    this.tokenDecimalsValid = false;
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
    if (!info) this.token.queryTokenInfo(asset.chain, asset.address, true);
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
    if (!this.detail) return '';
    return this.queryTokenName(this.detail.chain, this.detail.address, '');
  }

  symbol(info?: {token?: TokenInfo, account?: AccountTokenInfo}): string {
    if (info === undefined) {
      if (this.detail) {
        return this.queryTokenSymbol(this.detail.chain, this.detail.address, '');
      } else {
        return '';
      }
    }
    if (info.token) {
      const token = info.token;
      return this.queryTokenSymbol(token.chain, token.address, token.symbol);
    }
    if (info.account) {
      const account = info.account;
      return this.queryTokenSymbol(account.chain, account.address, account.symbol);
    }
    return '';
  }

  balance(): string {
    const balance = this.detail?.balance;
    if (!balance) return '';
    return `${balance} ${this.symbol()}`;
  }

  tokenAddress(): string {
    const address = this.detail?.address;
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
    if (!this.detail) return '';
    return this.queryTokenType(this.detail.chain, this.detail.address, '');
  }

  typeShown(): string {
    return ChainHelper.tokenTypeShown(this.chain(), this.type() as TokenTypeStr);
  }

  decimals(): string {
    if (!this.detail) return '';
    const decimals = this.queryTokenDecimals(this.detail.chain, this.detail.address);
    if (!decimals) return '';
    return `${decimals}`;
  }

  baseUri(): string {
    if (this.type() !== TokenTypeStr._721) return '';
    const info = this.getInfo();
    return info.token?.baseUri || '';
  }

  localSupply(): string {
    const info = this.getInfo();
    if (!info.token) return '';
    return info.token.localSupply.toBalanceStr(info.token.decimals) + ' ' + this.symbol(info);
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

  private queryTokenSymbol(chain: string, address: string, fallback: string = ''): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.symbol;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return asset.symbol;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.symbol) {
      return tokenInfo.symbol;
    }
    
    const symbol = this.token.tokenSymbol(address, chain);
    if (symbol) return symbol;
    this.token.queryTokenSymbol(chain, address, false);

    return fallback;
  }

  private queryTokenName(chain: string, address: string, fallback: string = ''): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.name;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return asset.name;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.name) {
      return tokenInfo.name;
    }
    
    const name = this.token.tokenName(address, chain);
    if (name) return name;
    this.token.queryTokenName(chain, address, false);

    return fallback;
  }

  private queryTokenType(chain: string, address: string, fallback: string = ''): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return TokenHelper.toTypeStr(verified.type);
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return asset.type;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.type !== TokenType.INVALID) {
      return TokenHelper.toTypeStr(tokenInfo.type);
    }
    
    const type = this.token.tokenType(address, chain);
    if (type) return TokenHelper.toTypeStr(type);
    this.token.queryTokenType(chain, address, false);

    return fallback;
  }

  private queryTokenDecimals(chain: string, address: string): number | undefined {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.decimals;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return +asset.decimals;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.type != TokenType.INVALID) {
      return tokenInfo.decimals.toNumber();
    }
    
    const decimals = this.token.tokenDecimals(address, chain);
    if (decimals === undefined) {
      this.token.queryTokenDecimals(chain, address, false);
    }
    return decimals;
  }

  private queryTokenWrapped(chain: string, address: string): boolean | undefined {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return false;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return false;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.type != TokenType.INVALID) {
      return false;
    }
    
    const wrapped = this.token.tokenWrapped(address, chain);
    if (wrapped === undefined) {
      this.token.queryTokenWrappedInfo(chain, address, false);
    }
    return wrapped;
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