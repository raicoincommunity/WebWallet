import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { TokenWidgetComponent, TokenItem } from '../token-widget/token-widget.component';
import { U256, TokenTypeStr, ChainHelper, ChainStr, ExtensionTokenOpStr, ExtensionTypeStr,
  TokenType, ZX } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { Web3Service } from '../../services/web3.service';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { ValidatorService } from '../../services/validator.service';
import { AssetWidgetComponent, AssetItem } from '../asset-widget/asset-widget.component';
import { TokenService, MapInfo, UnmapInfo } from '../../services/token.service';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import { SettingsService } from '../../services/settings.service';
import { LogoService } from '../../services/logo.service';


@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit {
  @ViewChild('mapTokenWidget') mapTokenWidget!: TokenWidgetComponent;
  @ViewChild('unmapAssetWidget') unmapAssetWidget! : AssetWidgetComponent;

  activePanel: string = Panel.MAP;

  // map
  inputMapAmount = '';
  inputMapTokenId = '';
  selectedMapOriginalChain = '';
  mapAmountStatus = 0;
  mapTokenIdStatus = 0;
  private mapAmount = U256.zero();
  private mapTokenId = U256.zero();
  private mapGasCache: U256 | undefined;
  mapInsufficientFunds = false;
  mapApproveStatus: string = ApproveStatus.NONE;
  private approveCheckingSince: number | undefined;

  // unmap
  private unmapGasCache: U256 | undefined;
  unmapInsufficientFunds = false;
  private freshUnmaps: { [hash: string]: boolean } = {};
  private waitingUnmaps: { [hash: string]: boolean } = {};
  private submittingUnmaps: { [hash: string]: number } = {};
  private unmapSubscription: any;
  private web3AccountSubscription: any;

  private gasTimer: any = null;
  private approveTimer: any = null;
  private chainTimer: any = null;

  filterMapToken: any;
  filterUnmapAsset: any;

  private selectedMap?: MapInfo;
  private selectedUnmap?: UnmapInfo;

  private SIGNATURES_PERCENT = 51;

  constructor(
    private notification: NotificationService,
    private translate: TranslateService,
    private wallets: WalletsService,
    private web3: Web3Service,
    private token: TokenService,
    private verified: VerifiedTokensService,
    private settings: SettingsService,
    private logo: LogoService,
    private validator: ValidatorService
  ) {
    this.filterMapToken = (token: TokenItem) => this.mapAllowedToken(token);
    this.filterUnmapAsset = (asset: AssetItem) => this.unmapAllowedAsset(asset);
  }

  ngOnInit(): void {
    this.unmapSubscription = this.token.tokenUnmap$.subscribe(unmap => {
      this.validator.signUnmap(unmap);
      this.startChainTimer();
    });

    this.web3AccountSubscription = this.web3.accountChanged$.subscribe(e => {
      this.mapApproveStatus = ApproveStatus.NONE;
      this.approveCheckingSince = undefined;
      if (e.to) {
        this.mapCheckApproved();
      }
      if (this.activePanel == Panel.MAP_CONFIRM) {
        this.mapGasCache = undefined;
        this.mapInsufficientFunds = false;
        this.updateMapGas();
      } else if (this.activePanel == Panel.UNMAP_CONFIRM) {
        this.unmapGasCache = undefined;
        this.unmapInsufficientFunds = false;
        this.updateUnmapGas();
      }
    });
  }

  startGasTimer() {
    if (this.gasTimer !== null) return;
    this.gasTimer = setInterval(() => {
      if (!this.gasTimer) return
      if (this.activePanel != Panel.MAP_CONFIRM && this.activePanel != Panel.UNMAP_CONFIRM) {
        clearInterval(this.gasTimer);
        this.gasTimer = null;
        return
      }
      this.updateGas();
    }, 5000);
  }

  startApproveTimer() {
    if (this.approveTimer !== null) return;
    this.approveTimer = setInterval(() => this.updateApproveStatus(), 5000);
  }

  tryStopApproveTimer() {
    if (!this.approveTimer) return;
    if (this.activePanel == Panel.MAP) {
      if (this.mapApproveStatus === ApproveStatus.CHECKING
        || this.mapApproveStatus === ApproveStatus.WAITING) {
          return;
        }
    } else {
      // pass
    }
    clearInterval(this.approveTimer);
    this.approveTimer = null;
  }

  startChainTimer() {
    if (this.chainTimer !== null) return;
    this.chainTimer = setInterval(() => this.updateChainInfo(), 5000);
  }

  @HostListener('unloaded')
  ngOnDestroy() {
    if (this.gasTimer) {
      clearInterval(this.gasTimer);
      this.gasTimer = null;
    }

    if (this.approveTimer) {
      clearInterval(this.approveTimer);
      this.approveTimer = null;
    }

    if (this.chainTimer) {
      clearInterval(this.chainTimer);
      this.chainTimer = null;
    }
    if (this.unmapSubscription) {
      this.unmapSubscription.unsubscribe();
      this.unmapSubscription = null;
    }
    if (this.web3AccountSubscription) {
      this.web3AccountSubscription.unsubscribe();
      this.web3AccountSubscription = null;
    }
  }

  setPanel(panel: string) {
    this.activePanel = panel as Panel;
  }

  mapOriginalChainChanged(selected: string) {
    if (selected) {
      this.validator.addChain(selected as ChainStr);
      this.token.addTokenMapInfos(selected);
    }
    if (this.mapTokenWidget) {
      this.mapTokenWidget.clear();
    }
  }

  mapOriginalChains(): string[] {
    return ChainHelper.crossChainStrs(true);
  }

  showChain(chain: string): string {
    return ChainHelper.toChainShown(chain);
  }
  
  onMapTokenChange() {
    this.syncMapAmount();
    this.syncMapTokenId();
    this.mapApproveStatus = ApproveStatus.NONE;
    this.approveCheckingSince = undefined;
    this.mapCheckApproved();
  }

  mapAllowedToken(token: TokenItem): boolean {
    if (ChainHelper.isRaicoin(token.chain)) {
      return false;
    }
    if (token.chain !== this.selectedMapOriginalChain) {
      return false;
    }
    return true;
  }

  unmapAllowedAsset(asset: AssetItem): boolean {
    if (ChainHelper.isRaicoin(asset.chain)) {
      return false;
    }
    return true;
  }

  mapTokenType(): string {
    if (!this.mapTokenWidget) return '';

    const token = this.mapTokenWidget.selectedToken;
    if (!token) return '';

    return token.type;
  }

  mapTokenSymbol(): string {
    if (!this.mapTokenWidget) return '';

    const token = this.mapTokenWidget.selectedToken;
    if (!token) return '';
    return token.symbol;
  }

  syncMapAmount() {
    if (this.inputMapAmount === '') {
      this.mapAmountStatus = 0;
      return;
    }

    if (!this.mapTokenWidget) {
      this.mapAmountStatus = 0;
      return;
    }

    const token = this.mapTokenWidget.selectedToken;
    if (!token) {
      this.mapAmountStatus = 0;
      return;
    }

    if (token.type != TokenTypeStr._20) {
      this.mapAmountStatus = 0;
      return;
    }

    try {
      const decimalsValue = new BigNumber(10).pow(token.decimals);
      this.mapAmount =
        new U256(new BigNumber(this.inputMapAmount).mul(decimalsValue));
      if (this.mapAmount.eq(0)) {
        this.mapAmountStatus = 2;
        return;
      }
      this.mapAmountStatus = 1;
    }
    catch (err) {
      this.mapAmountStatus = 2;
    }
  }

  syncMapTokenId() {
    if (this.inputMapTokenId === '') {
      this.mapTokenIdStatus = 0;
      return;
    }

    const widget = this.mapTokenWidget;
    if (!widget || !widget.selectedToken) {
      this.mapTokenIdStatus = 0;
      return;
    }

    const token = widget.selectedToken;
    if (token.type != TokenTypeStr._721) {
      this.mapTokenIdStatus = 0;
      return;
    }

    try {
      this.mapTokenId = new U256(this.inputMapTokenId);
      this.mapTokenIdStatus = 1;
    }
    catch (err) {
      this.mapTokenIdStatus = 2;
    }
  }

  raiShortAccount(): string {
    const account = this.wallets.selectedAccount();
    if (!account) return '';
    return account.shortAddress();
  }

  mapShowConnectWallet(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (ChainHelper.isEvmChain(token.chain)) {
      return !this.walletConnected(token.chain as ChainStr);
    }
    return false;
  }

  mapShowDisconnectWallet(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (ChainHelper.isEvmChain(token.chain)) {
      return this.walletConnected(token.chain as ChainStr);
    }
    return false;
  }

  mapSender(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    if (ChainHelper.isEvmChain(token.chain)) {
      if (!this.web3.connected(token.chain as ChainStr)) {
        return '';
      }
      return this.web3.account();
    }
    return '';
  }

  shortMapSender(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    if (ChainHelper.isEvmChain(token.chain)) {
      if (!this.web3.connected(token.chain as ChainStr)) {
        return '';
      }
      const sender = this.web3.account();
      if (!sender) return sender;
      return `${sender.substr(0, 7)}...${sender.substr(-5)}`;
    }
    return '';
  }

  selectedMapToken(): TokenItem | null {
    if (!this.mapTokenWidget || !this.mapTokenWidget.selectedToken) {
      return null;
    }

    return this.mapTokenWidget.selectedToken;
  }

  mapApprovable(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.mapWalletConnected()) return false;
    return this.mapApproveStatus == ApproveStatus.REJECTED
      || this.mapApproveStatus == ApproveStatus.ERROR;
  }

  mapApproveDisabled(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (ChainHelper.isNative(token.chain, token.addressRaw)) return false;
    return this.mapApproveStatus == ApproveStatus.NONE;
  }

  mapApprove() {
    const token = this.selectedMapToken();
    if (!token) return;
    if (ChainHelper.isEvmChain(token.chain)) {
      this.evmTokenApprove(token.chain, token.address, token.type as TokenTypeStr, token.symbol,
        error => {
          if (error) {
            this.mapApproveStatus = ApproveStatus.ERROR;
          } else {
            this.mapApproveStatus = ApproveStatus.CHECKING;
            this.approveCheckingSince = window.performance.now();
            this.startApproveTimer();
          }
        });
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
      return;
    }
    this.mapApproveStatus = ApproveStatus.WAITING;
  }

  async mapConnectWallet() {
    const token = this.selectedMapToken();
    if (!token) return;
    await this.connectWallet(token.chain as ChainStr);
    this.mapCheckApproved();
  }

  async connectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.connectWallet(chainStr);
    }
  }

  async mapDisconnectWallet() {
    const token = this.selectedMapToken();
    if (!token) return;
    await this.disconnectWallet(token.chain as ChainStr);
    this.mapApproveStatus = ApproveStatus.NONE;
  }

  async disconnectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.disconnectWallet();
    }
  }

  mapWalletConnected(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    return this.walletConnected(token.chain as ChainStr);
  }

  walletConnected(chainStr: ChainStr): boolean {
    if (ChainHelper.isEvmChain(chainStr)) {
      return this.web3.connected(chainStr);
    }
    return false;
  }

  mapable(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.mapWalletConnected()) return false;
    if (this.mapApproveStatus != ApproveStatus.APPROVED) return false;
    return true;
  }

  map() {
    const token = this.selectedMapToken();
    if (!token) {
      let msg = marker(`Please select a token`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (token.type == TokenTypeStr._20) {
      this.syncMapAmount();
      if (this.mapAmountStatus !== 1) {
        let msg = marker(`Please enter a valid amount`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else if (token.type == TokenTypeStr._721) {
      this.syncMapTokenId();
      if (this.mapTokenIdStatus !== 1) {
        let msg = marker(`Please enter a valid token id`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${token.type}`);
      return;
    }

    const wallet = this.wallets.selectedWallet();
    if (!wallet) return;

    this.validator.addChain(token.chain as ChainStr);

    const doWhenUnlocked = () => {
      this.activePanel = Panel.MAP_CONFIRM;
      this.mapGasCache = undefined;
      this.mapInsufficientFunds = false;
      this.updateGas();
      this.startGasTimer();
    };

    if (wallet.locked()) {
      this.wallets.tryInputPassword(() => doWhenUnlocked());
      return;
    }
    doWhenUnlocked();
  }

  mapCancel() {
    this.mapGasCache = undefined;
    this.mapInsufficientFunds = false;
    this.activePanel = Panel.MAP;
  }

  mapConfirm() {
    const token = this.selectedMapToken();
    if (!token) return;

    if (this.mapGasCache === undefined) return;
    if (this.mapInsufficientFunds) return;

    if (!this.walletConnected(token.chain as ChainStr)) {
      let msg = marker(`Your web3 wallet is not connected.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.activePanel = Panel.MAP;
      return;
    }

    if (ChainHelper.isEvmChain(token.chain)) {
      this.mapFromEvmChain();
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
    }
    this.mapReset();
  }

  mapReset() {
    this.inputMapAmount = '';
    this.inputMapTokenId = '';
    this.mapAmountStatus = 0;
    this.mapTokenIdStatus = 0;
    this.mapAmount = U256.zero();
    this.mapTokenId = U256.zero();
    this.mapGasCache = undefined;
    this.mapInsufficientFunds = false;
    this.mapApproveStatus= ApproveStatus.NONE;  
    this.activePanel = Panel.MAP;
  }

  maps(): MapInfo[] {
    if (!this.selectedMapOriginalChain) return [];
    const maps = this.token.accountTokenMaps(this.selectedMapOriginalChain);
    if (maps.length > 0 && !maps[0].confirmed) {
      this.startChainTimer();
    }
    return maps;
  }

  noMaps(): boolean {
    if (!this.selectedMapOriginalChain) return false;
    return this.token.noMaps(this.selectedMapOriginalChain);
  }

  moreMaps(): boolean {
    if (!this.selectedMapOriginalChain) return false;
    return this.token.moreMaps(this.selectedMapOriginalChain)
  }

  loadMoreMaps() {
    if (!this.selectedMapOriginalChain) return;
    this.token.loadMoreMaps(this.selectedMapOriginalChain);
  }

  mapItemAmount(map: MapInfo): string {
    const symbol = this.queryTokenSymbol(map.chain, map.address);
    if (!symbol) return '';
    let decimals = map.decimals;
    if (map.type === TokenType._20) {
      if (decimals === undefined) {
        decimals = this.queryTokenDecimals(map.chain, map.address);
        if (decimals === undefined) {
          return '';
        }
      }
      return `${map.value.toBalanceStr(decimals)} ${symbol}`;
    } else if (map.type === TokenType._721) {
      return `1 ${symbol}`;
    } else {
      return '';
    }
  }

  mapItemStatus(map: MapInfo): MapStatus {
    if (!map.confirmed) {
      return MapStatus.CONFIRMING
    }

    if (map.targetTxn) {
      return MapStatus.SUCCESS;
    }
    return MapStatus.CONFIRMED;
  }

  mapItemSuccess(map: MapInfo): boolean {
    return this.mapItemStatus(map) === MapStatus.SUCCESS;
  }

  mapItemConfirming(map: MapInfo): boolean {
    return this.mapItemStatus(map) === MapStatus.CONFIRMING;
  }

  mapItemConfirmed(map: MapInfo): boolean {
    return this.mapItemStatus(map) === MapStatus.CONFIRMED;
  }

  mapItemConfirms(map: MapInfo): string {
    const info = this.validator.chainInfo(map.chain as ChainStr);
    if (!info) return '';
    if (map.height > info.height) {
      return `0 / ${info.confirmations}`;
    } else {
      return `${info.height - map.height} / ${info.confirmations}`;
    }
  }

  mapShowAmount(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    return this.showAmount(this.mapAmount, token);
  }

  showAmount(amount: U256, token: TokenItem | AssetItem): string {
    if (!token) return '';
    if (token.type == TokenTypeStr._20) {
      return `${amount.toBalanceStr(token.decimals)} ${token.symbol}`;
    } else if (token.type == TokenTypeStr._721) {
      let tokenId  = amount.toDec();
      if (tokenId.length >= 12) {
        tokenId = `${tokenId.substring(0, 4)}...${tokenId.substring(tokenId.length - 4)}`;
      }
      return `1 ${token.symbol}(${tokenId})`;
    } else {
      return '';
    }
  }

  mapFromChain(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    return ChainHelper.toChainShown(token.chain as ChainStr);
  }

  mapSelectedChainLogo(): string {
    if (!this.selectedMapOriginalChain) return '';
    return this.logo.getChainLogo(this.selectedMapOriginalChain);
  }

  showMapSelectedChain(): string {
    if (!this.selectedMapOriginalChain) return '';
    return ChainHelper.toChainShown(this.selectedMapOriginalChain as ChainStr);
  }

  currentChain(): string {
    return ChainHelper.toChainShown(environment.current_chain);
  }

  raiAccount(): string {
    return this.wallets.selectedAccountAddress();
  }

  raiAccountRaw(): U256 | undefined {
    const account = this.raiAccount();
    if (!account) return undefined;
    const raw = new U256();
    const error = raw.fromAccountAddress(account);
    if (error) return undefined;
    return raw;
  }

  mapFeeAndGas(): string {
    const token = this.selectedMapToken();
    if (!token) return '';

    const nativeToken = this.verified.getNativeToken(token.chain);
    if (!nativeToken) return '';

    const gas = this.mapGasCache;
    if (!gas) return '';

    const fee = this.getFee(token.chain);
    if (!fee) return '';

    const sum = gas.plus(fee);

    return `${sum.toBalanceStr(nativeToken.decimals)} ${nativeToken.symbol}`;
  }

  mapCheckApproved() {
    const token = this.selectedMapToken();
    if (!token) return;
    this.checkApproved(token, (status: ApproveStatus, token: TokenItem) => {
      const currentToken = this.selectedMapToken();
      if (!currentToken || !token.eq(currentToken)) return;
      const now = window.performance.now();
      if (status === ApproveStatus.APPROVED) {
        this.mapApproveStatus = status;
      } else if (this.approveCheckingSince === undefined || now > this.approveCheckingSince + 60000) {
        this.mapApproveStatus = status;
      }
      this.tryStopApproveTimer();
    });
  }

  checkApproved(token: TokenItem, callback: (status: ApproveStatus, token: TokenItem) => void) {
    if (ChainHelper.isNative(token.chain, token.addressRaw)) {
      callback(ApproveStatus.APPROVED, token);
      return;
    }

    if (!this.walletConnected(token.chain as ChainStr)) {
      callback(ApproveStatus.NONE, token);
      return;
    }

    if (ChainHelper.isEvmChain(token.chain)) {
      this.checkEvmTokenApproved(token, callback);
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
      callback(ApproveStatus.ERROR, token);
    }
  }

  checkEvmTokenApproved(
    token: TokenItem,
    callback: (status: ApproveStatus, token: TokenItem) => void
  ) {
    const coreAddress = Web3Service.getCoreContractAddress(token.chain as ChainStr);
    if (!coreAddress) {
      console.error(`No core contract address for ${token.chain}`);
      callback(ApproveStatus.NONE, token);
      return;
    }

    if (token.type == TokenTypeStr._20) {
      const contract = this.web3.makeErc20Contract(token.address);
      try {
        contract.methods.allowance(this.web3.account(),
          coreAddress).call().then((res: any) => {
            if (res !== '0') {
              callback(ApproveStatus.APPROVED, token);
            } else {
              callback(ApproveStatus.REJECTED, token);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR, token);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR, token);
        return;
      }
    } else if (token.type == TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(token.address);
      try {
        contract.methods.isApprovedForAll(this.web3.account(),
          coreAddress).call().then((res: boolean) => {
            if (res) {
              callback(ApproveStatus.APPROVED, token);
            } else {
              callback(ApproveStatus.REJECTED, token);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR, token);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR, token);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${token.type}`);
      callback(ApproveStatus.NONE, token);
    }
  }

  evmTokenApprove(chain: string, address: string, type: TokenTypeStr, symbol: string, callback: (error: boolean) => void) {
    const coreAddress = Web3Service.getCoreContractAddress(chain as ChainStr);
    if (!coreAddress) {
      console.error(`No core contract address for ${chain}`);
      return;
    }

    if (type === TokenTypeStr._20) {
      const contract = this.web3.makeErc20Contract(address);
      contract.methods.approve(coreAddress, U256.max().to0xHex()).send({
          from: this.web3.account()
        }).then((res: any) => {
          console.log('evmTokenApprove res:', res);
          callback(false);
        }).catch((error: any) => {
          console.error('evmTokenApprove error:', error);
          callback(true);
        });
    } else if (type === TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(address);
      contract.methods.setApprovalForAll(coreAddress, true).send({
          from: this.web3.account()
        }).then((res: any) => {
          console.log('evmTokenApprove res:', res);
          callback(false);
        }).catch((error: any) => {
          console.error('evmTokenApprove error:', error);
          callback(true);
        });
    } else {
      console.error(`Unsupported token type: ${type}`);
      return;
    }
    let msg = marker(`An authorization request was sent to your web3 wallet, please check and approve Raicoin Protocol to use your { symbol }`);
    const param = { 'symbol': symbol };
    this.translate.get(msg, param).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });
  }

  updateApproveStatus() {
    if (this.activePanel == Panel.MAP) {
      this.mapCheckApproved();
    } else {
      // pass
    }
  }

  updateGas() {
    if (this.activePanel == Panel.MAP_CONFIRM) {
      this.updateMapGas();
    } else if (this.activePanel == Panel.UNMAP_CONFIRM) {
      this.updateUnmapGas();
    }
  }

  updateChainInfo() {
    if (!this.chainTimer) return;

    const queried: { [chain: string]: boolean } = {};
    const maps = this.maps();
    for (let map of maps) {
      if (map.confirmed) break;
      this.validator.syncChainHeadHeight(map.chain as ChainStr);
      queried[map.chain] = true;
      break;
    }

    const unmaps = this.unmaps();
    for (let unmap of unmaps) {
      if (unmap.targetConfirmed) continue;
      if (queried[unmap.chain]) continue;
      this.validator.syncChainHeadHeight(unmap.chain as ChainStr);
      queried[unmap.chain] = true;
    }

    if (Object.keys(queried).length === 0) {
      clearInterval(this.chainTimer);
      this.chainTimer = null;
    }
  }

  updateMapGas() {
    const token = this.selectedMapToken();
    if (!token) {
      this.mapGasCache = undefined;
      this.mapInsufficientFunds = false;
      return;
    }

    if (ChainHelper.isEvmChain(token.chain)) {
      const error = this.evmAfterGetGasPrice(token.chain as ChainStr,
        (price: number) => this.updateEvmMapGas(price));
      if (error) {
        this.mapGasCache = undefined;
        this.mapInsufficientFunds = false;
      }
    }
  }

  updateEvmMapGas(price: number): boolean {
    const token = this.selectedMapToken()!;
    if (!this.web3.connected(token.chain as ChainStr)) return true;
    const fee = this.getFee(token.chain);
    if (!fee) return true;
    if (token.type == TokenTypeStr._20) {
      if (ChainHelper.isNative(token.chain, token.addressRaw)) {
        try {
          this.web3.evmCoreContract.methods.mapETH(this.mapAmount.to0xHex(),
            this.raiAccountRaw()!.to0xHex(), fee.to0xHex()).estimateGas(
              {
                from: this.web3.account(), value: this.mapAmount.plus(fee).to0xHex()
              }).then((res: number) => {
                const gas = new U256(res).mul(price);
                this.mapGasCache = gas;
                this.mapInsufficientFunds = false;
              }).catch((error: any) => {
                console.error('evmMapGas error:', error);
                this.mapGasCache = undefined;
                this.mapInsufficientFunds = true;
              });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          this.mapGasCache = undefined;
          this.mapInsufficientFunds = false;
          return true;
        }
      } else {
        try {
          this.web3.evmCoreContract.methods.mapERC20(token.addressRaw.toEthAddress(),
            this.mapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
              from: this.web3.account(), value: fee.to0xHex()
            }).then((res: number) => {
              const gas = new U256(res).mul(price);
              this.mapGasCache = gas;
              this.mapInsufficientFunds = false;
            }).catch((error: any) => {
              console.error('evmMapGas error:', error);
              this.mapGasCache = undefined;
              this.mapInsufficientFunds = true;
            });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          this.mapGasCache = undefined;
          this.mapInsufficientFunds = false;
          return true;
        }
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.mapERC721(token.addressRaw.toEthAddress(),
          this.mapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            const gas = new U256(res).mul(price);
            this.mapGasCache = gas;
            this.mapInsufficientFunds = false;
          }).catch((error: any) => {
            console.error('evmMapGas error:', error);
            this.mapGasCache = undefined;
            this.mapInsufficientFunds = true;
          });
      } catch (e) {
        console.error('evmMapGas exception:', e);
        this.mapGasCache = undefined;
        this.mapInsufficientFunds = false;
        return true;
      }
    } else {
      return true;
    }

    return false;
  }

  updateEvmUnmapGas(price: number): boolean {
    const asset = this.selectedUnmapAsset();
    if (!asset) return true;
    if (!this.web3.connected(asset.chain as ChainStr)) return true;
    const recipient = this.unmapRecipient();
    if (!recipient) return true;
    const fee = this.getFee(asset.chain);
    if (!fee) return true;
    let gasEst = 0;
    if (asset.type == TokenTypeStr._20) {
      if (ChainHelper.isNative(asset.chain, asset.addressRaw)) {
        gasEst = 100000;
      } else {
        gasEst = 120000;
      }
    } else if (asset.type == TokenTypeStr._721) {
        gasEst = 150000;
    } else {
      return true;
    }
    try {
      this.web3.web3?.eth.getBalance(recipient).then((res: string) => {
        this.unmapGasCache = new U256(gasEst).mul(price);
        this.unmapInsufficientFunds = fee.plus(this.unmapGasCache).gt(res);
      }).catch((error: any) => {
        console.error('updateEvmUnmapGas error:', error);
        this.unmapGasCache = undefined;
        this.unmapInsufficientFunds = false;
      });
    } catch (e) {
      console.error('updateEvmUnmapGas exception:', e);
      this.unmapGasCache = undefined;
      this.unmapInsufficientFunds = false;
      return true;
    }

    return false;
  }

  mapFromEvmChain() {
    const token = this.selectedMapToken()!;
    if (!this.web3.connected(token.chain as ChainStr)) return;
    const fee = this.getFee(token.chain);
    if (!fee) return;

    if (token.type == TokenTypeStr._20) {
      if (ChainHelper.isNative(token.chain, token.addressRaw)) {
        try {
          this.web3.evmCoreContract.methods.mapETH(this.mapAmount.to0xHex(),
            this.raiAccountRaw()!.to0xHex(), fee.to0xHex()).send(
              {
                from: this.web3.account(), value: this.mapAmount.plus(fee).to0xHex()
              }).then((res: any) => {
                console.log(typeof res);
                console.log(res);
              }).catch((error: any) => {
                console.error('mapFromEvmChain error:', error);
              });
        } catch (e) {
          console.error('mapFromEvmChain exception:', e);
          return;
        }
      } else {
        try {
          this.web3.evmCoreContract.methods.mapERC20(token.addressRaw.toEthAddress(),
            this.mapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).send({
              from: this.web3.account(), value: fee.to0xHex()
            }).then((res: any) => {
              console.log(typeof res);
              console.log(res);
            }).catch((error: any) => {
              console.error('evmMapGas error:', error);
            });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          return;
        }
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.mapERC721(token.addressRaw.toEthAddress(),
          this.mapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).send({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
          }).catch((error: any) => {
            console.error('evmMapGas error:', error);
          });
      } catch (e) {
        console.error('evmMapGas exception:', e);
        return;
      }
    } else {
      console.error('mapFromEvmChain: unknown token type:', token.type);
      return;
    }

    let msg = marker(`The MAP request was sent, please check and approve the transaction in your web3 wallet.`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });
  }

  evmAfterGetGasPrice(chain: string, fn: any): boolean {
    if (!this.web3.connected(chain as ChainStr)) return true;
    this.web3.web3?.eth.getGasPrice().then((res: any) => {
      console.log('price:', res);
      fn(res);
    });
    return false;
  }

  getFee(chain: string): U256 | undefined {
    const info = this.validator.chainInfo(chain as ChainStr);
    if (!info) return undefined;
    return info.feeRoundUp;
  }

  unmapOriginalChain(): string {
    if (!this.unmapAssetWidget) return '';
    const asset = this.unmapAssetWidget.selectedAsset;
    if (!asset) return '';
    return this.showChain(asset.chain);
  }

  shortUnmapRecipient(): string {
    const asset = this.selectedUnmapAsset();
    if (!asset) return '';
    const recipient = this.unmapRecipient();
    if (!recipient) return '';
    return ChainHelper.toShortAddress(asset.chain, recipient, 5);
  }

  selectedUnmapAsset(): AssetItem | undefined {
    if (!this.unmapAssetWidget || !this.unmapAssetWidget.selectedAsset) {
      return undefined;
    }

    return this.unmapAssetWidget.selectedAsset;
  }

  onUnmapAssetChanged() {
  }

  unmapWalletConnected(): boolean {
    const asset = this.selectedUnmapAsset();
    if (!asset) return false;
    return this.walletConnected(asset.chain as ChainStr);
  }

  unmapShowConnectWallet(): boolean {
    const asset = this.selectedUnmapAsset();
    if (!asset) return false;
    if (ChainHelper.isEvmChain(asset.chain)) {
      return !this.walletConnected(asset.chain as ChainStr);
    }
    return false;
  }

  unmapShowDisconnectWallet(): boolean {
    const asset = this.selectedUnmapAsset();
    if (!asset) return false;
    if (ChainHelper.isEvmChain(asset.chain)) {
      return this.walletConnected(asset.chain as ChainStr);
    }
    return false;
  }

  unmapable(): boolean {
    const asset = this.selectedUnmapAsset();
    if (!asset) return false;
    if (!this.raiAccount()) return false;
    if (!this.unmapWalletConnected()) return false;
    return true;
  }

  async unmapConnectWallet() {
    const asset = this.selectedUnmapAsset();
    if (!asset) return;
    await this.connectWallet(asset.chain as ChainStr);
  }

  async unmapDisconnectWallet() {
    const asset = this.selectedUnmapAsset();
    if (!asset) return;
    await this.disconnectWallet(asset.chain as ChainStr);
  }

  unmapCheck(): boolean {
    if (!this.raiAccount()) return true;
    if (!this.unmapAssetWidget) return true;
    if (this.unmapAssetWidget.check()) return true;
    return false;
  }

  unmapShowAmount(): string {
    const widget = this.unmapAssetWidget;
    if (!widget) return '';
    const asset = widget.selectedAsset;
    if (!asset) return '';
    
    return this.showAmount(widget.amount, asset);
  }

  unmapToChain(): string {
    const asset = this.selectedUnmapAsset();
    if (!asset) return '';
    return ChainHelper.toChainShown(asset.chain as ChainStr);
  }

  unmapRecipient(): string {
    const asset = this.selectedUnmapAsset();
    if (!asset) return '';
    if (ChainHelper.isEvmChain(asset.chain)) {
      if (!this.web3.connected(asset.chain as ChainStr)) {
        return '';
      }
      const account = this.web3.account();
      return ChainHelper.formatAddress(asset.chain, account);
    }
    return '';
  }

  unmapFeeAndGas(): string {
    const asset = this.selectedUnmapAsset();
    if (!asset) return '';

    const nativeToken = this.verified.getNativeToken(asset.chain);
    if (!nativeToken) return '';

    const gas = this.unmapGasCache;
    if (!gas) return '';
    const fee = this.getFee(asset.chain);
    if (!fee) return '';
    const sum = gas.plus(fee);

    return `${sum.toBalanceStr(nativeToken.decimals)} ${nativeToken.symbol}`;
  }

  updateUnmapGas() {
    const asset = this.selectedUnmapAsset();
    if (!asset) {
      this.unmapGasCache = undefined;
      this.unmapInsufficientFunds = false;
      return;
    }

    if (ChainHelper.isEvmChain(asset.chain)) {
      const error = this.evmAfterGetGasPrice(asset.chain as ChainStr,
        (price: number) => this.updateEvmUnmapGas(price));
      if (error) {
        this.unmapGasCache = undefined;
        this.unmapInsufficientFunds = false;
      }
    }
  }

  unmap() {
    const asset = this.selectedUnmapAsset();
    if (!asset) {
      let msg = marker(`Please select an asset`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    if (this.unmapCheck()) {
      if (asset.type == TokenTypeStr._20) {
        if (this.unmapAssetWidget.amountStatus !== 1) {
          let msg = marker(`Please enter a valid amount`);
          this.translate.get(msg).subscribe(res => msg = res);
          this.notification.sendError(msg);
        }
      }
      else if (asset.type == TokenTypeStr._721) {
        if (this.unmapAssetWidget.syncTokenId()) {
          let msg = marker(`Please select a valid token ID`);
          this.translate.get(msg).subscribe(res => msg = res);
          this.notification.sendError(msg);
        }
      }
      return;
    };

    const wallet = this.wallets.selectedWallet();
    if (!wallet) return;

    this.validator.addChain(asset.chain as ChainStr);

    const doWhenUnlocked = () => {
      this.activePanel = Panel.UNMAP_CONFIRM;
      this.unmapGasCache = undefined;
      this.updateGas();
      this.startGasTimer();
    };

    if (wallet.locked()) {
      this.wallets.tryInputPassword(() => doWhenUnlocked());
      return;
    }
    doWhenUnlocked();
  }

  unmapCancel() {
    this.unmapGasCache = undefined;
    this.unmapInsufficientFunds = false;
    this.activePanel = Panel.UNMAP;
  }

  unmapConfirm() {
    if (this.unmapCheck()) return;
    const widget = this.unmapAssetWidget;
    if (!widget) return;
    const asset = this.selectedUnmapAsset();
    if (!asset) return;

    if (this.unmapGasCache === undefined) return;
    if (this.unmapInsufficientFunds) return;

    if (!this.walletConnected(asset.chain as ChainStr)) {
      let msg = marker(`Your web3 wallet is not connected.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.activePanel = Panel.UNMAP;
      return;
    }

    const to = new U256();
    let error = to.fromEthAddress(this.unmapRecipient());
    if (error) return;

    let value: any = {
      op: ExtensionTokenOpStr.UNMAP,
      chain: asset.chain,
      type: asset.type,
      address_raw: asset.addressRaw.toHex(),
      to_raw: to.toHex(),
      extra_data: '0',
    };
    if (asset.type === TokenTypeStr._20) {
      value.value = widget.amount.toDec();
    } else if (asset.type === TokenTypeStr._721) {
      value.value = widget.tokenId.toDec();
    } else {
      console.error(`unmapConfirm:Unknown type=${asset.type}`);
      return;
    }
    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.token.change(this.raiAccount(), extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    const hash = result.block!.hash().toHex();
    this.freshUnmaps[hash] = true;

    let msg = marker(`[1/2] Sending {unmap} block to {raicoin} network`);
    const param = { 'unmap': 'UNMAP', 'raicoin': 'Raicoin' };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg);

    this.unmapReset();
  }

  unmapReset() {
    if (this.unmapAssetWidget) {
      this.unmapAssetWidget.clearAmount();
    }
    this.unmapGasCache = undefined;
    this.unmapInsufficientFunds = false;
    this.activePanel = Panel.UNMAP;
  }

  autoSubmitFreshUnmap(unmap: UnmapInfo) {
    if (this.freshUnmaps[unmap.sourceTxn] !== true) return;
    if (this.hasWaitingUnmaps()) return;
    if (unmap.targetValid()) return;
    if (!this.walletConnected(unmap.chain as ChainStr)) return;

    this.unmapSubmit(unmap);
    delete this.freshUnmaps[unmap.sourceTxn];
  }

  unmaps(): UnmapInfo[] {
    const unmaps = this.token.accountTokenUnmaps();
    for (let unmap of unmaps) {
      const status = this.unmapItemStatus(unmap);
      if (status === UnmapStatus.NONE) {
        this.validator.signUnmap(unmap);
        this.startChainTimer();
      } else if (status === UnmapStatus.COLLECTED) {
        this.autoSubmitFreshUnmap(unmap);
      } else if (status === UnmapStatus.CONFIRMING) {
        this.validator.addChain(unmap.chain as ChainStr);
      }
    }
    return unmaps;
  }

  noUnmaps(): boolean {
    return this.token.noUnmaps();
  }

  moreUnmaps(): boolean {
    return this.token.moreUnmaps()
  }

  loadMoreUnmaps() {
    this.token.loadMoreUnmaps();
  }

  unmapItemChainLogo(unmap: UnmapInfo): string {
    return this.logo.getChainLogo(unmap.chain);
  }

  unmapItemShowChain(unmap: UnmapInfo): string {
    return ChainHelper.toChainShown(unmap.chain);
  }

  unmapItemAmount(unmap: UnmapInfo): string {
    const symbol = this.queryTokenSymbol(unmap.chain, unmap.address);
    if (!symbol) return '';
    if (unmap.type === TokenType._20) {
      return `${unmap.value.toBalanceStr(unmap.decimals!)} ${symbol}`;
    } else if (unmap.type === TokenType._721) {
      return `1 ${symbol}`;
    } else {
      return '';
    }
  }

  unmapItemStatus(unmap: UnmapInfo): string {
    if (unmap.targetConfirmed) {
      return UnmapStatus.CONFIRMED;
    } else if (unmap.targetValid()) {
      return UnmapStatus.CONFIRMING;
    } else if (this.waitingUnmaps[unmap.sourceTxn]) {
      return UnmapStatus.WAITING;
    } else if (this.submittingUnmaps[unmap.sourceTxn]) {
      if (this.submittingUnmaps[unmap.sourceTxn] + 60000 < window.performance.now()) {
        delete this.submittingUnmaps[unmap.sourceTxn];
      }
      return UnmapStatus.SUBMITING;
    } else {
      if (!this.validator.signing(unmap.account, unmap.height)) {
        return UnmapStatus.NONE;
      }

      const percent = this.validator.signedPercent(unmap.account, unmap.height);
      if (percent > this.SIGNATURES_PERCENT) return UnmapStatus.COLLECTED;
      return UnmapStatus.COLLECTING;
    }
  }

  unmapItemConfirms(unmap: UnmapInfo): string {
    const info = this.validator.chainInfo(unmap.chain as ChainStr);
    if (!info || !unmap.targetValid()) return '';

    const targetHeight = unmap.targetHeight.toNumber();
    if (targetHeight > info.height) {
      return `0 / ${info.confirmations}`;
    } else {
      return `${info.height - targetHeight} / ${info.confirmations}`;
    }
  }

  unmapSignedPercent(unmap: UnmapInfo): number {
    return this.validator.signedPercent(unmap.account, unmap.height);
  }

  unmapShowSpin(unmap: UnmapInfo): boolean {
    const status = this.unmapItemStatus(unmap);
    if (status === UnmapStatus.COLLECTING || status === UnmapStatus.WAITING
      || status === UnmapStatus.SUBMITING) {
      return true;
    }
    return false;
  }

  unmapShowStatus(unmap: UnmapInfo): string {
    const status = this.unmapItemStatus(unmap);
    let msg = '';
    let param: any;
    if (status === UnmapStatus.COLLECTING) {
      msg = marker(`Collecting signatures ({ percent }%)`);
      param = { 'percent': this.unmapSignedPercent(unmap) };
    } else if (status === UnmapStatus.COLLECTED) {
      msg = marker('Signatures collected ({ percent }%), click to submit the transaction to { chain }');
      param = {
        'percent': this.validator.signedPercent(unmap.account, unmap.height),
        'chain': ChainHelper.toChainShown(unmap.chain),
      };
    } else if (status === UnmapStatus.WAITING) {
      msg = marker('Waiting');
    } else if (status === UnmapStatus.SUBMITING) {
      msg = marker('Submiting transaction to { chain }');
      param = { 'chain': ChainHelper.toChainShown(unmap.chain) }
    } else if (status === UnmapStatus.CONFIRMED) {
      msg = marker('Success');
    }

    if (!msg) return '';
    this.translate.get(msg, param).subscribe(res => msg = res);    
    return msg;
  }

  unmapToEvmChain(unmap: UnmapInfo, callback: (error: boolean) => void): boolean {
    if (!this.web3.connected(unmap.chain as ChainStr)) return true;
    const fee = this.getFee(unmap.chain);
    if (!fee) return true;
    let signatures = this.validator.transferSignatures(unmap.account, unmap.height,
      this.SIGNATURES_PERCENT);
    if (!signatures) {
      console.error(`MapComponent::unmapToEvmChain: failed to get signatures`);
      return true;
    }
    signatures = ZX + signatures;

    if (unmap.type == TokenType._20) {
      if (ChainHelper.isNative(unmap.chain, unmap.addressRaw)) {
        try {
          this.web3.evmCoreContract.methods.unmapETH(unmap.fromRaw.to0xHex(),
            unmap.toRaw.toEthAddress(), ZX + unmap.sourceTxn, unmap.height,
            unmap.value.to0xHex(), signatures).send(
              {
                from: this.web3.account(), value: fee.to0xHex()
              }).then((res: any) => {
                console.log(typeof res);
                console.log(res);
                callback(false);
              }).catch((error: any) => {
                console.error('unmapETH error:', error);
                callback(true);
              });
        } catch (e) {
          console.error('unmapETH exception:', e);
          return true;
        }
      } else {
        try {
          this.web3.evmCoreContract.methods.unmapERC20(unmap.addressRaw.toEthAddress(),
          unmap.fromRaw.to0xHex(), unmap.toRaw.toEthAddress(), ZX + unmap.sourceTxn,
          unmap.height, unmap.value.to0xHex(), signatures).send({
              from: this.web3.account(), value: fee.to0xHex()
            }).then((res: any) => {
              console.log(typeof res);
              console.log(res);
              callback(false);
            }).catch((error: any) => {
              console.error('unmapERC20 error:', error);
              callback(true);
            });
        } catch (e) {
          console.error('unmapERC20 exception:', e);
          return true;
        }
      }
    } else if (unmap.type == TokenType._721) {
      try {
        this.web3.evmCoreContract.methods.unmapERC721(unmap.addressRaw.toEthAddress(),
        unmap.fromRaw.to0xHex(), unmap.toRaw.toEthAddress(), ZX + unmap.sourceTxn,
        unmap.height, unmap.value.to0xHex(), signatures).send({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
            callback(false);
          }).catch((error: any) => {
            console.error('unmapERC721 error:', error);
            callback(true);
          });
      } catch (e) {
        console.error('unmapERC721 exception:', e);
        return true;
      }
    } else {
      console.error('unmapToEvmChain: unknown token type:', unmap.type);
      return true;
    }

    let msg = marker(`[2/2] Submitting {unmap} transaction to {chain}, please check and approve it in your web3 wallet`);
    const param = { 'unmap': 'UNMAP', 'chain': ChainHelper.toChainShown(unmap.chain) };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg);
    return false;
  }

  unmapSubmit(unmap: UnmapInfo) {
    if (!this.walletConnected(unmap.chain as ChainStr)) {
      let msg = marker(`Please connect your web3 wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (ChainHelper.isEvmChain(unmap.chain)) {
      const error = this.unmapToEvmChain(unmap, error => {
        delete this.waitingUnmaps[unmap.sourceTxn];
        if (!error) {
          this.submittingUnmaps[unmap.sourceTxn] = window.performance.now();
        }
      });
      if (!error) {
        this.waitingUnmaps[unmap.sourceTxn] = true;
      }
    } else {
      console.error(`Unsupported chain: ${unmap.chain}`);
      return;
    }
  }

  unmapRetry(unmap: UnmapInfo) {
    if (!this.unmapAssetWidget) return;
    this.unmapAssetWidget.clearAmount();
    this.unmapAssetWidget.selectAssetByTokenAddress(unmap.chain, unmap.address);
    this.unmapSubmit(unmap);
  }

  selectMap(map: MapInfo) {
    this.selectedMap = map;
    this.activePanel = Panel.MAP_DETAILS;
  }

  selectedMapItemSourceHash(): string {
    const map = this.selectedMap;
    if (!map) return '';
    return map.sourceTxn;
  }

  sourceHashCopied() {
    let msg = marker(`Source hash copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedMapItemSender(): string {
    const map = this.selectedMap;
    if (!map) return '';
    return map.from;
  }

  senderCopied() {
    let msg = marker(`Sender copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedMapItemOriginalChain(): string {
    const map = this.selectedMap;
    if (!map) return '';
    return ChainHelper.toChainShown(map.chain);
  }

  selectedMapItemTokenAddress(): string {
    const map = this.selectedMap;
    if (!map) return '';
    if (map.address) return map.address;
    return 'N/A';
  }

  tokenAddressCopied() {
    let msg = marker(`Token address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedMapItemSentAt(): number {
    const map = this.selectedMap;
    if (!map) return 0;
    const timestamp = this.token.txTimestamp(map.chain, map.sourceTxn);
    if (!timestamp) {
      this.token.queryTxTimestamp(map.chain, map.sourceTxn, map.height);
      return 0;
    }
    return timestamp;
  }

  selectedMapItemAmount(): string {
    const map = this.selectedMap;
    if (!map) return '';
    const symbol = this.queryTokenSymbol(map.chain, map.address);
    if (!symbol) return '';
    if (map.type == TokenType._20) {
      let decimals = map.decimals;
      if (decimals === undefined) {
        decimals = this.queryTokenDecimals(map.chain, map.address);
        if (decimals === undefined) {
          return '';
        }
      }
      return `${map.value.toBalanceStr(decimals)} ${symbol}`;
    } else if (map.type == TokenType._721) {
      return `1 ${symbol} (${map.value.toDec()})`;
    } else {
      return '';
    }
  }

  selectedMapItemDestHash(): string {
    const map = this.selectedMap;
    if (!map) return '';
    return map.targetTxn;
  }

  destHashCopied() {
    let msg = marker(`Destination hash copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedMapItemRecipient(): string {
    const map = this.selectedMap;
    if (!map) return '';
    return map.to;
  }

  recipientCopied() {
    let msg = marker(`Recipient copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedMapItemReceivedAt(): number {
    const map = this.selectedMap;
    if (!map || !map.targetTimestamp) return 0;
    return map.targetTimestamp;
  }

  selectUnmap(unmap: UnmapInfo) {
    this.selectedUnmap = unmap;
    this.activePanel = Panel.UNMAP_DETAILS;
  }

  selectedUnmapItemOriginalChain(): string {
    const unmap = this.selectedUnmap;
    if (!unmap) return '';
    return ChainHelper.toChainShown(unmap.chain);
  }

  selectedUnmapItemTokenAddress(): string {
    if (!this.selectedUnmap) return '';
    return this.selectedUnmap.address;
  }

  selectedUnmapItemSourceHash(): string {
    const unmap = this.selectedUnmap;
    if (!unmap) return '';
    return unmap.sourceTxn;
  }

  selectedUnmapItemSender(): string {
    const unmap = this.selectedUnmap;
    if (!unmap) return '';
    return unmap.from;
  }

  selectedUnmapItemSentAt(): number {
    const unmap = this.selectedUnmap;
    if (!unmap) return 0;
    return unmap.sourceTimestamp;
  }

  selectedUnmapItemReceivedAt(): number {
    const unmap = this.selectedUnmap;
    if (!unmap || !unmap.targetValid()) return 0;
    const timestamp = this.token.txTimestamp(unmap.chain, unmap.targetTxn);
    if (!timestamp) {
      this.token.queryTxTimestamp(unmap.chain, unmap.targetTxn, unmap.targetHeight.toNumber());
      return 0;
    }
    return timestamp;
  }

  selectedUnmapItemAmount(): string {
    const unmap = this.selectedUnmap;
    if (!unmap) return '';
    const symbol = this.queryTokenSymbol(unmap.chain, unmap.address);
    if (!symbol) return '';
    if (unmap.type == TokenType._20) {
      let decimals = unmap.decimals;
      if (decimals === undefined) {
        decimals = this.queryTokenDecimals(unmap.chain, unmap.address);
        if (decimals === undefined) {
          return '';
        }
      }
      return `${unmap.value.toBalanceStr(decimals)} ${symbol}`;
    } else if (unmap.type == TokenType._721) {
      return `1 ${symbol} (${unmap.value.toDec()})`;
    } else {
      return '';
    }
  }

  selectedUnmapItemRecipient(): string {
    const unmap = this.selectedUnmap;
    if (!unmap) return '';
    return unmap.to;
  }

  selectedUnmapItemDestHash(): string {
    const unmap = this.selectedUnmap;
    if (!unmap) return '';
    return unmap.targetTxn;
  }

  private queryTokenSymbol(chain: string, address: string): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.symbol;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return asset.symbol;
    }

    const symbol = this.token.tokenSymbol(address, chain);
    if (symbol) return symbol;
    this.token.queryTokenSymbol(chain, address, false);

    return '';
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

  private hasWaitingUnmaps(): boolean {
    for (let i in this.waitingUnmaps) {
      return true;
    }
    return false;
  }

}

enum Panel {
  MAP = 'map',
  MAP_CONFIRM = 'map_confirm',
  UNMAP = 'unmap',
  UNMAP_CONFIRM = 'unmap_confirm',
  MAP_DETAILS = 'map_details',
  UNMAP_DETAILS = 'unmap_details',
}

enum ApproveStatus {
  NONE = '',
  CHECKING = 'checking',
  WAITING = 'waiting',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ERROR = 'error',
}

enum MapStatus {
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
  SUCCESS = 'success',
}

enum UnmapStatus {
  NONE = '',
  COLLECTING = 'collecting',
  COLLECTED = 'collected',
  WAITING = 'waiting',
  SUBMITING = 'submitting',
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
}