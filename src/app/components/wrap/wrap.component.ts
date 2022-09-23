import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { AssetWidgetComponent, AssetItem } from '../asset-widget/asset-widget.component';
import { U256, TokenTypeStr, ChainHelper, ChainStr, ExtensionTokenOpStr, ExtensionTypeStr,
  TokenType, ZX, EVM_ZERO_ADDRESS } from '../../services/util.service';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { ValidatorService } from '../../services/validator.service';
import { Web3Service } from '../../services/web3.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { NotificationService } from '../../services/notification.service';
import { TokenWidgetComponent, TokenItem } from '../token-widget/token-widget.component';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import { TokenService, WrapInfo, UnwrapInfo } from '../../services/token.service';
import { BigNumber } from 'bignumber.js';
import { LogoService } from '../../services/logo.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-wrap',
  templateUrl: './wrap.component.html',
  styleUrls: ['./wrap.component.css']
})
export class WrapComponent implements OnInit {
  @ViewChild('wrapAssetWidget') wrapAssetWidget! : AssetWidgetComponent;
  @ViewChild('unwrapTokenWidget') unwrapTokenWidget!: TokenWidgetComponent;

  activePanel: string = Panel.WRAP;

  // wrap
  selectedWrapTargetChain = '';
  wrapInsufficientFunds = false;
  private wrapTargetChainsCache?: ChainStr[] = undefined;
  private wrapGasCache: U256 | undefined;
  private wrapContractStatus = new WrapContractStatusContainer();
  private web3Subscription: any;
  private freshWraps: { [hash: string]: boolean } = {};
  private waitingWraps: { [hash: string]: boolean } = {};
  private submittingWraps: { [hash: string]: number } = {};
  private wrapSubscription: any;

  // unwrap
  selectedUnwrapSourceChain = '';
  unwrapTokenFilter: any;
  inputUnwrapAmount = '';
  inputUnwrapTokenId = '';
  unwrapAmountStatus = 0;
  unwrapTokenIdStatus = 0;
  unwrapApproveStatus: string = ApproveStatus.NONE;
  unwrapInsufficientFunds = false;
  private unwrapAmount = U256.zero();
  private unwrapTokenId = U256.zero();
  private approveCheckingSince: number | undefined;
  private unwrapGasCache: U256 | undefined;
  private unwrapContractStatus = new WrapContractStatusContainer();


  // timers
  private gasTimer: any = null;
  private approveTimer: any = null;
  private wrapContractStatusTimer: any = null;
  private unwrapContractStatusTimer: any = null;
  private chainTimer: any = null;

  constructor(
    private wallets: WalletsService,
    private validator: ValidatorService,
    private web3: Web3Service,
    private translate: TranslateService,
    private notification: NotificationService,
    private verified: VerifiedTokensService,
    private token: TokenService,
    private settings: SettingsService,
    private logo: LogoService
  ) {
    this.unwrapTokenFilter = (token: TokenItem) => this.unwrapAllowedToken(token);
  }

  ngOnInit(): void {
    this.web3Subscription = this.web3.accountChanged$.subscribe(e => {
      this.wrapTargetChainChanged(this.selectedWrapTargetChain);
      this.onUnwrapTokenChange();
    });
  }

  @HostListener('unloaded')
  ngOnDestroy() {
    if (this.web3Subscription) {
      this.web3Subscription.unsubscribe();
      this.web3Subscription = null;
    }
    if (this.gasTimer) {
      clearInterval(this.gasTimer);
      this.gasTimer = null;
    }
    if (this.approveTimer) {
      clearInterval(this.approveTimer);
      this.approveTimer = null;
    }
    if (this.wrapContractStatusTimer) {
      clearInterval(this.wrapContractStatusTimer);
      this.wrapContractStatusTimer = null;
    }
    if (this.unwrapContractStatusTimer) {
      clearInterval(this.unwrapContractStatusTimer);
      this.unwrapContractStatusTimer = null;
    }
    if (this.chainTimer) {
      clearInterval(this.chainTimer);
      this.chainTimer = null;
    }
  }

  startWrapContractStatusTimer() {
    if (this.wrapContractStatusTimer !== null) return;
    this.wrapContractStatusTimer = setInterval(() => {
      this.processWrapContractStatusTimer();
    }, 5000);
  }

  updateChainInfo() {
    if (!this.chainTimer) return;

    const queried: { [chain: string]: boolean } = {};
    for (let wrap of this.wraps()) {
      if (wrap.targetConfirmed) continue;
      const chain = wrap.toChain;
      if (queried[chain]) continue;
      this.validator.syncChainHeadHeight(chain as ChainStr);
      queried[chain] = true;
    }

    const unwraps = this.unwraps();
    if (unwraps.length > 0 && !unwraps[0].confirmed) {
      this.validator.syncChainHeadHeight(unwraps[0].fromChain as ChainStr);
      queried[unwraps[0].fromChain] = true;
    }

    if (Object.keys(queried).length === 0) {
      clearInterval(this.chainTimer);
      this.approveTimer = null;
    }
  }

  processWrapContractStatusTimer() {
    if (!this.wrapContractStatusTimer) return;
    do {
      if (this.activePanel != Panel.WRAP) break;
      const asset = this.wrapSelectedAsset();
      if (!asset) break;
      const chain = this.selectedWrapTargetChain;
      if (!chain) break;
      if (this.wrapShowConnectWallet()) break;
      const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
      if (!status || status.created) break;
      this.wrapSyncContractStatus(asset, chain);
      if (status.created === false) {
        this.wrapSignCreation(asset, chain);
      }
      return;
    } while (0);

    clearInterval(this.wrapContractStatusTimer);
    this.wrapContractStatusTimer = null;
  }

  startGasTimer() {
    if (this.gasTimer !== null) return;
    this.gasTimer = setInterval(() => {
      if (!this.gasTimer) return
      if (this.activePanel != Panel.WRAP_CONFIRM && this.activePanel != Panel.UNWRAP_CONFIRM) {
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
    if (this.activePanel == Panel.UNWRAP) {
      if (this.unwrapApproveStatus === ApproveStatus.CHECKING
        || this.unwrapApproveStatus === ApproveStatus.WAITING) {
          return;
        }
    } else {
      // pass
    }
    clearInterval(this.approveTimer);
    this.approveTimer = null;
  }

  updateApproveStatus() {
    if (this.activePanel == Panel.UNWRAP) {
      this.unwrapCheckApproved();
    } else {
      // pass
    }
  }


  startUnwrapContractStatusTimer() {
    if (this.unwrapContractStatusTimer !== null) return;
    this.unwrapContractStatusTimer = setInterval(() => {
      this.processUnwrapContractStatusTimer();
    }, 5000);
  }

  processUnwrapContractStatusTimer() {
    if (!this.unwrapContractStatusTimer) return;
    do {
      if (this.activePanel != Panel.UNWRAP) break;
      const token = this.unwrapSelectedToken();
      if (!token) break;
      const chain = this.selectedUnwrapSourceChain;
      if (!chain) break;
      if (this.unwrapShowConnectWallet()) break;
      const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
      if (!status || status.created) break;
      this.unwrapSyncContractStatus(token, chain);
      return;
    } while (0);

    clearInterval(this.unwrapContractStatusTimer);
    this.unwrapContractStatusTimer = null;
  }

  startChainTimer() {
    if (this.chainTimer !== null) return;
    this.chainTimer = setInterval(() => this.updateChainInfo(), 5000);
  }

  setPanel(panel: string) {
    this.activePanel = panel as Panel;
  }

  onWrapAssetChanged() {
    this.wrapTargetChainsCache = undefined;
    this.selectedWrapTargetChain = '';
  }

  showChain(chain: string): string {
    return ChainHelper.toChainShown(chain);
  }

  wrapSelectedAsset(): AssetItem | undefined {
    if (!this.wrapAssetWidget) return undefined;
    return this.wrapAssetWidget.selectedAsset;
  }

  wrapOriginalChain(): string {
    const asset = this.wrapSelectedAsset();
    if (!asset) return '';
    return this.showChain(asset.chain);
  }

  wrapTargetChainChanged(selected: string) {
    if (!selected) return;
    const asset = this.wrapSelectedAsset();
    if (!asset) return;
    let status = this.wrapContractStatus.get(asset.chain, asset.address, selected);
    if (!status) {
      status = new WrapContractStatus();
      this.wrapContractStatus.add(asset.chain, asset.address, selected, status);
    }
    this.wrapSyncContractStatus(asset, selected);
    this.startWrapContractStatusTimer();
    this.validator.addChain(selected as ChainStr);
  }

  wrapTargetChains(): string[] {
    if (this.wrapTargetChainsCache === undefined) {
      this.wrapTargetChainsCache = [];
      const asset = this.wrapSelectedAsset();
      if (asset) {
        const chains = ChainHelper.crossChainStrs(false);
        for (let chain of chains) {
          if (chain != asset.chain) {
            this.wrapTargetChainsCache.push(chain);
          }
        }
      }
    }
    return this.wrapTargetChainsCache;
  }

  wrapRecipient(): string {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    if (ChainHelper.isEvmChain(chain)) {
      if (!this.web3.connected(chain as ChainStr)) {
        return '';
      }
      const account = this.web3.account();
      return ChainHelper.formatAddress(chain, account);
    }
    return '';
  }

  wrapShowTargetChain(): string {
    if (!this.selectedWrapTargetChain) return '';
    return ChainHelper.toChainShown(this.selectedWrapTargetChain);
  }

  wrapContract(): string {
    const asset = this.wrapSelectedAsset();
    if (!asset) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    let status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status || !status.created) return '';
    return status.address!;
  }

  shortWrapContract(): string {
    const asset = this.wrapSelectedAsset();
    if (!asset) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    const contract = this.wrapContract();
    if (!contract) return '';
    const short = ChainHelper.toShortAddress(chain, contract, 7);
    return `r${asset.symbol} <${short}>`;
  }

  wrapContractCopied() {
    let msg = marker(`The wrap contract address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  shortWrapRecipient(): string {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    const recipient = this.wrapRecipient();
    if (!recipient) return '';
    return ChainHelper.toShortAddress(chain, recipient, 5);
  }

  wrapable(): boolean {
    return !this.wrapCheck();
  }

  wrapWalletConnected(): boolean {
    if (!this.selectedWrapTargetChain) return false;
    return this.walletConnected(this.selectedWrapTargetChain as ChainStr);
  }

  wrapShowConnectWallet(): boolean {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return !this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  async wrapConnectWallet() {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;
    await this.connectWallet(chain as ChainStr);
  }

  wrapShowDisconnectWallet(): boolean {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  async wrapDisconnectWallet() {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;
    await this.disconnectWallet(chain as ChainStr);
  }

  queryEvmChainWrapContractStatus(chain: string, address: string, targetChain: string,
    callback: (error: boolean, address?: string) => void): boolean {
    if (!this.web3.connected(targetChain as ChainStr)) return true;

    try {
      const chainId = ChainHelper.toChain(chain);
      this.web3.evmCoreContract.methods.wrappedToken(chainId, address).call(
          {
            from: this.web3.account()
          }).then((res: any) => {
            const address = new U256(res, 16).toEthAddress();
            console.log(address);
            callback(false, address);
          }).catch((error: any) => {
            console.error('queryEvmChainWrapContractStatus error:', error);
            callback(true);
          });
    } catch (e) {
      console.error('queryEvmChainWrapContractStatus exception:', e);
      return true;
    }
    return false;
  }

  syncContractStatus(
    chain: string,
    address: string,
    targetChain: string,
    status: WrapContractStatus,
    callback: (error: boolean, status: WrapContractStatus) => void
  ) {
    if (status.created === true) return;
    const now = window.performance.now();
    if (status.lastQuery !== undefined && status.lastQuery + 5000 > now) {
      return;
    }
    if (ChainHelper.isEvmChain(targetChain)) {
      this.queryEvmChainWrapContractStatus(chain, address, targetChain, (error, address) => {
        if (!error) {
          status.created = address !== EVM_ZERO_ADDRESS;
          status.address = address;
        }
        callback(error, status);
      });
    } else {
      console.error(`syncContractStatus: unknow target chain, ${targetChain}`);
    }

    status.lastQuery = now;
  }

  wrapSyncContractStatus(asset: AssetItem, targetChain: string) {
    const status = this.wrapContractStatus.get(asset.chain, asset.address, targetChain);
    if (!status) return;
    this.syncContractStatus(asset.chain, asset.addressRaw.to0xHex(), targetChain, status,
      (error, status) => {
        if (status.created === false) {
          this.wrapSignCreation(asset, targetChain);
        }
      });
  }

  wrapSignCreation(asset: AssetItem, chain: string) {
    const originalContract = asset.addressRaw.to0xHex();
    if (!this.validator.signingCreation(asset.chain, originalContract, chain)) {
      this.validator.signCreation(asset.chain, asset.addressRaw.to0xHex(), chain, asset.type,
        asset.decimals.toNumber());
    }
  }

  wrapFetchingData(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status) return false;
    if (this.wrapShowConnectWallet()) return false;
    return status.created === undefined;
  }

  wrapCollectingSignatures(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status || status.created !== false || status.waiting || status.submitting()) {
      return false;
    }
    if (this.wrapShowConnectWallet()) return false;
    const originalContract = asset.addressRaw.to0xHex();
    const signing = this.validator.signingCreation(asset.chain, originalContract, chain);
    if (!signing) return false;
    const percent = this.validator.creationSignedPercent(asset.chain, originalContract, chain);
    if (percent > 51) return false;
    return true;
  }

  wrapContractCreated(): boolean | undefined {
    const asset = this.wrapSelectedAsset();
    if (!asset) return undefined;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return undefined;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status) return undefined;

    return status.created;
  }

  wrapContractWaiting(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status || status.created || !status.waiting) return false;
    return true;
  }

  wrapContractSubmitting(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status || status.created) return false;
    return status.submitting();
  }

  wrapContractCreatable(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status) return false;
    if (status.created !== false || status.waiting || status.submitting()) {
      return false;
    }
    if (this.wrapShowConnectWallet()) return false;
    
    const originalContract = asset.addressRaw.to0xHex();
    const params = this.validator.creationParameters(asset.chain, originalContract, chain);
    if (!params) return false;
    const percent = this.validator.creationSignedPercent(asset.chain, originalContract, chain);
    if (percent <= 51) return false;

    return true;
  }

  create() {
    if (!this.wrapContractCreatable()) return;
    const asset = this.wrapSelectedAsset()!;
    const chain = this.selectedWrapTargetChain!;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain)!;
    if (ChainHelper.isEvmChain(chain)) {
      const error = this.evmCreateWrapContract(error => {
        status.waiting = false;
        if (!error) {
          status.submitAt = window.performance.now();
        }
      });
      if (!error) {
        status.waiting = true;
      }
    } else {
      console.error(`create: unsupported chain ${chain}`);
    }
  }

  evmCreateWrapContract(callback: (error: boolean) => void): boolean {
    const asset = this.wrapSelectedAsset()!;
    const chain = this.selectedWrapTargetChain!;
    const originalContract = asset.addressRaw.to0xHex();
    const params = this.validator.creationParameters(asset.chain, originalContract, chain)!;
    const signatures = this.validator.creationSigatures(asset.chain, originalContract, chain, 51);
    if (!signatures) return true;
    if (!this.web3.connected(chain as ChainStr)) return true;

    const originalChainId = ChainHelper.toChain(asset.chain);

    if (asset.type == TokenTypeStr._20) {
      try {
        this.web3.evmCoreContract.methods.createWrappedERC20Token(params.name, params.symbol, params.chain, originalChainId, originalContract, asset.decimals.to0xHex(),
          ZX + signatures).send({
            from: this.web3.account()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
            callback(false);
          }).catch((error: any) => {
            console.error('evmCreateWrapContract: error=', error);
            callback(true);
          });
      } catch (e) {
        console.error('evmCreateWrapContract: exception=', e);
        return true;
      }
    } else if (asset.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.createWrappedERC721Token(params.name, params.symbol,
          params.chain, originalChainId, originalContract, asset.decimals.to0xHex(),
          ZX + signatures).send({
            from: this.web3.account()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
            callback(false);
          }).catch((error: any) => {
            console.error('evmCreateWrapContract: error=', error);
            callback(true);
          });
      } catch (e) {
        console.error('evmCreateWrapContract: exception=', e);
        return true;
      }
    } else {
      return true;
    }

    let msg = marker(`The wrap contract creation request was sent, please check and approve the transaction in your web3 wallet.`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });
    return false;
  }

  wrapCheck(): boolean {
    if (!this.raiAccount()) return true;
    if (!this.wrapAssetWidget) return true;
    if (this.wrapAssetWidget.check()) return true;
    if (!this.selectedWrapTargetChain) return true;
    if (!this.wrapWalletConnected()) return true;
    if (!this.wrapContractCreated()) return true;
    return false;
  }

  wrap() {
    const asset = this.wrapSelectedAsset();
    if (!asset) {
      let msg = marker(`Please select an asset`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    if (this.wrapCheck()) return;
    const wallet = this.wallets.selectedWallet();
    if (!wallet) return;

    this.validator.addChain(this.selectedWrapTargetChain as ChainStr);

    const doWhenUnlocked = () => {
      this.activePanel = Panel.WRAP_CONFIRM;
      this.wrapGasCache = undefined;
      this.updateGas();
      this.startGasTimer();
    };

    if (wallet.locked()) {
      this.wallets.tryInputPassword(() => doWhenUnlocked());
      return;
    }
    doWhenUnlocked();
  }

  wrapCancel() {
    this.wrapGasCache = undefined;
    this.wrapInsufficientFunds = false;
    this.activePanel = Panel.WRAP;
  }

  wrapConfirm() {
    if (!this.wrapWalletConnected()) {
      let msg = marker(`Your web3 wallet is not connected.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.activePanel = Panel.WRAP;
      return;
    }

    if (this.wrapCheck()) return;
    const widget = this.wrapAssetWidget;
    if (!widget) return;
    const asset = this.wrapSelectedAsset();
    if (!asset) return;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;

    if (this.wrapGasCache === undefined) return;
    if (this.wrapInsufficientFunds) return;

    let ret = ChainHelper.addressToRaw(chain, this.wrapRecipient());
    if (ret.error) return;
    const to = ret.raw!;

    let value: any = {
      op: ExtensionTokenOpStr.WRAP,
      chain: asset.chain,
      type: asset.type,
      address_raw: asset.addressRaw.toHex(),
      to_chain: chain,
      to_account_raw: to.toHex(),
    };
    if (asset.type === TokenTypeStr._20) {
      value.value = widget.amount.toDec();
    } else if (asset.type === TokenTypeStr._721) {
      value.value = widget.tokenId.toDec();
    } else {
      console.error(`wrapConfirm:Unknown type=${asset.type}`);
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

    let msg = marker(`[1/2] Sending {wrap} block to {raicoin} network`);
    const param = { 'wrap': 'WRAP', 'raicoin': 'Raicoin' };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg);

    this.wrapReset();
  }

  wrapReset() {
    if (this.wrapAssetWidget) {
      this.wrapAssetWidget.clear();
    }
    this.wrapGasCache = undefined;
    this.wrapInsufficientFunds = false;
    this.activePanel = Panel.WRAP;
  }

  wrapShowAmount(showTokenId: boolean = false): string {
    const widget = this.wrapAssetWidget;
    if (!widget) return '';
    const asset = widget.selectedAsset;
    if (!asset) return '';
    if (asset.type == TokenTypeStr._20) {
      return this.showAmount(widget.amount, asset);
    } else if (asset.type == TokenTypeStr._721) {
      return this.showAmount(widget.tokenId, asset, showTokenId);
    }
    return '';
  }

  wrapShowTargetAmount(): string {
    const widget = this.wrapAssetWidget;
    if (!widget) return '';
    const asset = widget.selectedAsset;
    if (!asset) return '';
    if (asset.type == TokenTypeStr._20) {
      return this.showAmount(widget.amount, asset, true, true);
    } else if (asset.type == TokenTypeStr._721) {
      return this.showAmount(widget.tokenId, asset, true, true);
    }
    return '';
  }

  wrapOriginalTokenAddress(): string {
    const asset =  this.wrapSelectedAsset();
    if (!asset) return '';
    return asset.address;
  }

  raiAccount(): string {
    return this.wallets.selectedAccountAddress();
  }

  raiShortAccount(): string {
    const account = this.wallets.selectedAccount();
    if (!account) return '';
    return account.shortAddress();
  }

  showAmount(
    amount: U256,
    token: TokenItem | AssetItem,
    showTokenId: boolean = false,
    wrapped: boolean = false
  ): string {
    if (!token) return '';
    let symbol = token.symbol;
    if (wrapped) {
      symbol = 'r' + symbol;
    }
    if (token.type == TokenTypeStr._20) {
      return `${amount.toBalanceStr(token.decimals)} ${symbol}`;
    } else if (token.type == TokenTypeStr._721) {
      if (showTokenId) {
        const id = amount.toDec();
        if (id.length <= 11) {
          return `1 ${symbol} (${id})`;
        } else {
          return `1 ${symbol} (${id.substring(0, 4)}...${id.substring(id.length - 4)})`;
        }
      } else {
        return `1 ${symbol}`;
      }
    } else {
      return '';
    }
  }

  walletConnected(chainStr: ChainStr): boolean {
    if (ChainHelper.isEvmChain(chainStr)) {
      return this.web3.connected(chainStr);
    }
    return false;
  }

  async connectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.connectWallet(chainStr);
    }
  }

  async disconnectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.disconnectWallet();
    }
  }

  wrapFeeAndGas(): string {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';

    const nativeToken = this.verified.getNativeToken(chain);
    if (!nativeToken) return '';

    const gas = this.wrapGasCache;
    if (!gas) return '';
    const fee = this.getFee(chain);
    if (!fee) return '';
    const sum = gas.plus(fee);

    return `${sum.toBalanceStr(nativeToken.decimals)} ${nativeToken.symbol}`;
  }

  updateGas() {
    if (this.activePanel == Panel.WRAP_CONFIRM) {
      this.updateWrapGas();
    } else if (this.activePanel == Panel.UNWRAP_CONFIRM) {
      this.updateUnwrapGas();
    }
  }

  updateWrapGas() {
    const asset = this.wrapSelectedAsset();
    const chain = this.selectedWrapTargetChain;
    if (!asset || !chain) {
      this.wrapGasCache = undefined;
      return;
    }
    
    if (ChainHelper.isEvmChain(chain)) {
      const error = this.evmAfterGetGasPrice(chain as ChainStr,
        (price: number) => this.updateEvmWrapGas(price));
      if (error) {
        this.wrapGasCache = undefined;
        this.wrapInsufficientFunds = false;
      }
    }
  }

  updateEvmWrapGas(price: number): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return true;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return true;
    if (!this.web3.connected(chain as ChainStr)) return true;
    const recipient = this.wrapRecipient();
    if (!recipient) return true;
    const fee = this.getFee(chain);
    if (!fee) return true;
    let gasEst = 0;
    if (asset.type == TokenTypeStr._20) {
        // todo:
        gasEst = 50000;
    } else if (asset.type == TokenTypeStr._721) {
        // todo:
        gasEst = 50000;
    } else {
      return true;
    }
    try {
      this.web3.web3?.eth.getBalance(recipient).then((res: string) => {
        this.wrapGasCache = new U256(gasEst).mul(price);
        console.log(`fee.plus(this.wrapGasCache).gt(res)=`, fee.plus(this.wrapGasCache).gt(res));
        this.wrapInsufficientFunds = fee.plus(this.wrapGasCache).gt(res);
      }).catch((error: any) => {
        console.error('updateEvmWrapGas error:', error);
        this.wrapGasCache = undefined;
        this.wrapInsufficientFunds = false;
      });
    } catch (e) {
      console.error('updateEvmWrapGas exception:', e);
      this.wrapGasCache = undefined;
      this.wrapInsufficientFunds = false;
      return true;
    }

    return false;
  }

  updateUnwrapGas() {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) {
      this.unwrapGasCache = undefined;
      this.unwrapInsufficientFunds = false;
      return;
    }

    if (ChainHelper.isEvmChain(chain)) {
      const error = this.evmAfterGetGasPrice(chain as ChainStr,
        (price: number) => this.updateEvmUnwrapGas(price));
      if (error) {
        this.unwrapGasCache = undefined;
        this.unwrapInsufficientFunds = false;
      }
    }
  }

  updateEvmUnwrapGas(price: number): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return true;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return true;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created || !status.address) return true;
    if (!this.web3.connected(chain as ChainStr)) return true;
    const fee = this.getFee(token.chain);
    if (!fee) return true;

    const processResponse = (error: boolean, res?: number) => {
      if (error) {
        this.unwrapGasCache = undefined;
        this.unwrapInsufficientFunds = true;
      } else {
        const gas = new U256(res).mul(price);
        this.unwrapGasCache = gas;
        this.unwrapInsufficientFunds = false;
      }
    };

    if (token.type == TokenTypeStr._20) {
      try {
        this.web3.evmCoreContract.methods.unwrapERC20Token(status.address,
          this.unwrapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            processResponse(false, res);
          }).catch((error: any) => {
            console.error('updateEvmUnwrapGas: error=', error);
            processResponse(true);
          });
      } catch (e) {
        console.error('updateEvmUnwrapGas: exception=', e);
        return true;
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.unwrapERC721Token(status.address,
          this.unwrapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            processResponse(false, res);
          }).catch((error: any) => {
            console.error('updateEvmUnwrapGas: error=', error);
            processResponse(true);
          });
      } catch (e) {
        console.error('updateEvmUnwrapGas: exception=', e);
        return true;
      }
    } else {
      return true;
    }

    return false;
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
    return info.fee;
  }

  unwrapSourceChainChanged(selected: string) {
    if (selected) {
      this.validator.addChain(selected as ChainStr);
      this.token.addTokenUnwrapInfos(selected);
    }
    if (this.unwrapTokenWidget) {
      this.unwrapTokenWidget.clear();
    }
  }

  unwrapSourceChains(): string[] {
    return ChainHelper.crossChainStrs(false);
  }

  unwrapContract(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    let status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created) return '';
    return status.address!;
  }

  shortUnwrapContract(): string {
    if (this.unwrapContractCreated() === false) {
      let msg = marker(`Not created`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    const token = this.unwrapSelectedToken();
    if (!token) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    const contract = this.unwrapContract();
    if (!contract) return '';
    const short = ChainHelper.toShortAddress(chain, contract, 7);
    return `r${token.symbol} <${short}>`;
  }

  unwrapSyncContractStatus(token: TokenItem, targetChain: string) {
    const status = this.unwrapContractStatus.get(token.chain, token.address, targetChain);
    if (!status) return;
    this.syncContractStatus(token.chain, token.addressRaw.to0xHex(), targetChain, status,
      (error, status) => {
      if (status.created === true && this.unwrapTokenEq(token, targetChain)) {
        this.unwrapCheckApproved();
      }
    });
  }

  onUnwrapTokenChange() {
    this.syncUnwrapAmount();
    this.syncUnwrapTokenId();
    this.unwrapApproveStatus = ApproveStatus.NONE;
    this.approveCheckingSince = undefined;

    const token = this.unwrapSelectedToken();
    if (!token) return;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    let status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status) {
      status = new WrapContractStatus();
      this.unwrapContractStatus.add(token.chain, token.address, chain, status);
    }
    this.unwrapSyncContractStatus(token, chain);
    this.startUnwrapContractStatusTimer();

    if (status.created) {
      this.unwrapCheckApproved();
    }
  }

  unwrapSender(): string {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return '';
    if (ChainHelper.isEvmChain(chain)) {
      if (!this.web3.connected(chain as ChainStr)) {
        return '';
      }
      return this.web3.account();
    }
    return '';
  }

  shortUnwrapSender(): string {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return '';
    const sender = this.unwrapSender();
    return ChainHelper.toShortAddress(chain, sender, 5);
  }

  unwrapAllowedToken(token: TokenItem): boolean {
    if (token.chain === this.selectedUnwrapSourceChain) {
      return false;
    }
    return true;
  }

  unwrapSelectedToken(): TokenItem | undefined {
    const widget = this.unwrapTokenWidget;
    if (!widget) return undefined;
    return widget.selectedToken;
  }

  unwrapTokenType(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';

    return token.type;
  }

  unwrapTokenFormat(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    return token.shortTextFormat();
  }

  syncUnwrapAmount() {
    if (this.inputUnwrapAmount === '') {
      this.unwrapAmountStatus = 0;
      return;
    }

    const token = this.unwrapSelectedToken();
    if (!token) {
      this.unwrapAmountStatus = 0;
      return;
    }

    if (token.type != TokenTypeStr._20) {
      this.unwrapAmountStatus = 0;
      return;
    }

    try {
      const decimalsValue = new BigNumber(10).pow(token.decimals);
      this.unwrapAmount =
        new U256(new BigNumber(this.inputUnwrapAmount).mul(decimalsValue));
      if (this.unwrapAmount.eq(0)) {
        this.unwrapAmountStatus = 2;
        return;
      }
      this.unwrapAmountStatus = 1;
    }
    catch (err) {
      this.unwrapAmountStatus = 2;
    }
  }

  syncUnwrapTokenId() {
    if (this.inputUnwrapTokenId === '') {
      this.unwrapTokenIdStatus = 0;
      return;
    }

    const token = this.unwrapSelectedToken();
    if (!token) {
      this.unwrapTokenIdStatus = 0;
      return;
    }

    if (token.type != TokenTypeStr._721) {
      this.unwrapTokenIdStatus = 0;
      return;
    }

    try {
      this.unwrapTokenId = new U256(this.inputUnwrapTokenId);
      this.unwrapTokenIdStatus = 1;
    }
    catch (err) {
      this.unwrapTokenIdStatus = 2;
    }
  }

  unwrapOriginalChain(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    return ChainHelper.toChainShown(token.chain);
  }

  unwrapWalletConnected(): boolean {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    return this.walletConnected(chain as ChainStr);
  }

  unwrapContractCreated(): boolean | undefined {
    const token = this.unwrapSelectedToken();
    if (!token) return undefined;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return undefined;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status) return undefined;

    return status.created;
  }

  unwrapApprovable(): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.unwrapWalletConnected()) return false;
    if (!this.unwrapContractCreated()) return false;
    return this.unwrapApproveStatus == ApproveStatus.REJECTED
      || this.unwrapApproveStatus == ApproveStatus.ERROR;
  }

  unwrapFetchingData(): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status) return false;
    if (this.unwrapShowConnectWallet()) return false;
    return status.created === undefined;
  }

  unwrapApprove() {
    const token = this.unwrapSelectedToken();
    if (!token) return;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    const address = this.unwrapContract();
    if (!address) return;
    const symbol = `r${token.symbol}`;
    if (ChainHelper.isEvmChain(chain)) {
      this.evmTokenApprove(chain, address, token.type as TokenTypeStr, symbol,
        error => {
          if (error) {
            this.unwrapApproveStatus = ApproveStatus.ERROR;
          } else {
            this.unwrapApproveStatus = ApproveStatus.CHECKING;
            this.approveCheckingSince = window.performance.now();
            this.startApproveTimer();
          }
        });
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
      return;
    }
    this.unwrapApproveStatus = ApproveStatus.WAITING;
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

  unwrapable(): boolean {
    return !this.unwrapCheck();
  }

  unwrapCheck(): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return true;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return true;
    if (!this.raiAccount()) return true;
    if (!this.unwrapWalletConnected()) return true;
    if (token.type == TokenTypeStr._20) {
      this.syncUnwrapAmount();
      if (this.unwrapAmountStatus !== 1) return true;
    } else if (token.type == TokenTypeStr._721) {
      this.syncUnwrapTokenId();
      if (this.unwrapTokenIdStatus !== 1) return true;
    } else {
      console.error(`unwrapCheck: unsupported token type ${token.type}`);
      return true;
    }
    if (this.unwrapApproveStatus != ApproveStatus.APPROVED) return true;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created || !status.address) return true;
    return false;
  }

  unwrap() {
    const error = this.unwrapCheck();
    if (error) return;

    this.activePanel = Panel.UNWRAP_CONFIRM;
    this.unwrapGasCache = undefined;
    this.unwrapInsufficientFunds = false;
    this.updateGas();
    this.startGasTimer();
    this.validator.addChain(this.selectedUnwrapSourceChain as ChainStr);
  }

  unwraps() {
    if (!this.selectedUnwrapSourceChain) return [];
    const unwraps = this.token.accountTokenUnwraps(this.selectedUnwrapSourceChain);
    if (unwraps.length > 0 && !unwraps[0].confirmed) {
      this.startChainTimer();
    }
    return unwraps;
  }

  unwrapShowConnectWallet(): boolean {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return !this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  unwrapShowDisconnectWallet(): boolean {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  async unwrapConnectWallet() {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    await this.connectWallet(chain as ChainStr);
    const token = this.unwrapSelectedToken();
    if (token) {
      this.unwrapSyncContractStatus(token, chain);
    }
  }

  async unwrapDisconnectWallet() {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    await this.disconnectWallet(chain as ChainStr);
    this.unwrapApproveStatus = ApproveStatus.NONE;
  }

  unwrapTokenEq(tokenOther: TokenItem, chainOther: string): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    return token.eq(tokenOther) && chain === chainOther;
  }

  unwrapCheckApproved() {
    const token = this.unwrapSelectedToken();
    if (!token) return;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created) return;

    this.checkApproved(chain, status.address!, token.type, (status: ApproveStatus) => {
      const currentToken = this.unwrapSelectedToken();
      if (!currentToken || !token.eq(currentToken)) return;
      if (chain != this.selectedUnwrapSourceChain) return;
      const now = window.performance.now();
      if (status === ApproveStatus.APPROVED) {
        this.unwrapApproveStatus = status;
      } else if (this.approveCheckingSince === undefined || now > this.approveCheckingSince + 60000) {
        this.unwrapApproveStatus = status;
      }
      this.tryStopApproveTimer();
    });
  }

  checkApproved(chain: string, address: string, type: string, callback: (status: ApproveStatus) => void) {
    if (!this.walletConnected(chain as ChainStr)) {
      callback(ApproveStatus.NONE);
      return;
    }

    if (ChainHelper.isEvmChain(chain)) {
      this.checkEvmTokenApproved(chain, address, type, callback);
    } else {
      console.error(`Unsupported chain: ${chain}`);
      callback(ApproveStatus.ERROR);
    }
  }

  checkEvmTokenApproved(
    chain: string, address: string, type: string,
    callback: (status: ApproveStatus) => void
  ) {
    const coreAddress = Web3Service.getCoreContractAddress(chain as ChainStr);
    if (!coreAddress) {
      console.error(`No core contract address for ${chain}`);
      callback(ApproveStatus.NONE);
      return;
    }

    if (type == TokenTypeStr._20) {
      const contract = this.web3.makeErc20Contract(address);
      try {
        contract.methods.allowance(this.web3.account(),
          coreAddress).call().then((res: any) => {
            if (res !== '0') {
              callback(ApproveStatus.APPROVED);
            } else {
              callback(ApproveStatus.REJECTED);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR);
        return;
      }
    } else if (type == TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(address);
      try {
        contract.methods.isApprovedForAll(this.web3.account(),
          coreAddress).call().then((res: boolean) => {
            if (res) {
              callback(ApproveStatus.APPROVED);
            } else {
              callback(ApproveStatus.REJECTED);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${type}`);
      callback(ApproveStatus.NONE);
    }
  }

  raiAccountRaw(): U256 | undefined {
    const account = this.raiAccount();
    if (!account) return undefined;
    const raw = new U256();
    const error = raw.fromAccountAddress(account);
    if (error) return undefined;
    return raw;
  }

  unwrapShowAmount(showTokenId: boolean = false): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    if (token.type == TokenTypeStr._20) {
      return this.showAmount(this.unwrapAmount, token);
    } else if (token.type == TokenTypeStr._721) {
      return this.showAmount(this.unwrapTokenId, token, showTokenId);
    }
    return '';
  }

  unwrapShowSourceAmount(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    if (token.type == TokenTypeStr._20) {
      return this.showAmount(this.unwrapAmount, token, true, true);
    } else if (token.type == TokenTypeStr._721) {
      return this.showAmount(this.unwrapTokenId, token, true, true);
    }
    return '';
  }

  unwrapShowSourceChain(): string {
    if (!this.selectedUnwrapSourceChain) return '';
    return ChainHelper.toChainShown(this.selectedUnwrapSourceChain);
  }

  unwrapFeeAndGas(): string {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return '';

    const nativeToken = this.verified.getNativeToken(chain);
    if (!nativeToken) return '';

    const gas = this.unwrapGasCache;
    if (!gas) return '';
    const fee = this.getFee(chain);
    if (!fee) return '';
    const sum = gas.plus(fee);

    return `${sum.toBalanceStr(nativeToken.decimals)} ${nativeToken.symbol}`;
  }

  unwrapOriginalTokenAddress(): string {
    const token =  this.unwrapSelectedToken();
    if (!token) return '';
    return token.address;
  }

  unwrapCancel() {
    this.unwrapGasCache = undefined;
    this.unwrapInsufficientFunds = false;
    this.activePanel = Panel.UNWRAP;
  }

  unwrapConfirm() {
    if (!this.unwrapWalletConnected()) {
      let msg = marker(`Your web3 wallet is not connected.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.activePanel = Panel.UNWRAP;
      return;
    }
    if (this.unwrapGasCache === undefined) return;
    if (this.unwrapInsufficientFunds) return;

    const chain = this.selectedUnwrapSourceChain;


    if (ChainHelper.isEvmChain(chain)) {
      this.unwrapFromEvmChain();
    } else {
      console.error(`unwrapConfirm: unsupported chain ${chain}`);
    }
    this.unwrapReset();
  }

  unwrapReset() {
    if (this.unwrapTokenWidget) {
      this.unwrapTokenWidget.clear();
    }
    this.inputUnwrapAmount = '';
    this.inputUnwrapTokenId = '';
    this.unwrapAmountStatus = 0;
    this.unwrapTokenIdStatus = 0;
    this.unwrapAmount = U256.zero();
    this.unwrapTokenId = U256.zero();
    this.unwrapGasCache = undefined;
    this.unwrapInsufficientFunds = false;
    this.unwrapApproveStatus= ApproveStatus.NONE;  
    this.activePanel = Panel.UNWRAP;
  }

  unwrapFromEvmChain() {
    const token = this.unwrapSelectedToken()!;
    const chain = this.selectedUnwrapSourceChain;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!this.web3.connected(chain as ChainStr)) return;
    const fee = this.getFee(token.chain);
    if (!fee) return;

    if (token.type == TokenTypeStr._20) {
      try {
        this.web3.evmCoreContract.methods.unwrapERC20Token(status.address!,
          this.unwrapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            console.log(typeof res);
            console.log(res);
          }).catch((error: any) => {
            console.error('unwrapFromEvmChain: error=', error);
          });
      } catch (e) {
        console.error('unwrapFromEvmChain: exception=', e);
        return;
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.unwrapERC721Token(status.address,
          this.unwrapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            console.log(typeof res);
            console.log(res);
          }).catch((error: any) => {
            console.error('unwrapFromEvmChain: error=', error);
          });
      } catch (e) {
        console.error('unwrapFromEvmChain: exception=', e);
        return;
      }
    } else {
      return;
    }

    let msg = marker(`The UNWRAP request was sent, please check and approve the transaction in your web3 wallet.`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });
  }

  autoSubmitFreshWrap(wrap: WrapInfo) {
    if (this.freshWraps[wrap.sourceTxn] !== true) return;
    if (this.hasWaitingWraps()) return;
    if (wrap.targetValid()) return;
    if (!this.walletConnected(wrap.toChain as ChainStr)) return;

    this.wrapSubmit(wrap);
    delete this.freshWraps[wrap.sourceTxn];
  }

  wraps(): WrapInfo[] {
    const wraps = this.token.accountTokenWraps();
    for (let wrap of wraps) {
      const status = this.wrapItemStatus(wrap);
      if (status === WrapStatus.NONE) {
        this.validator.signWrap(wrap);
        this.startChainTimer();
      } else if (status === WrapStatus.COLLECTED) {
        this.autoSubmitFreshWrap(wrap); 
      }
    }
    return wraps;
  }

  noWraps(): boolean {
    return this.token.noWraps();
  }

  moreWraps(): boolean {
    return this.token.moreWraps()
  }

  loadMoreWraps() {
    this.token.loadMoreWraps();
  }

  wrapItemTargetChainLogo(wrap: WrapInfo): string {
    return this.logo.getChainLogo(wrap.toChain);
  }

  wrapItemShowTargetChain(wrap: WrapInfo): string {
    return ChainHelper.toChainShown(wrap.toChain);
  }

  wrapItemAmount(wrap: WrapInfo): string {
    const symbol = this.queryTokenSymbol(wrap.chain, wrap.address);
    if (!symbol) return '';
    if (wrap.type === TokenType._20) {
      return `${wrap.value.toBalanceStr(wrap.decimals!)} ${symbol}`;
    } else if (wrap.type === TokenType._721) {
      return `1 ${symbol}`;
    } else {
      return '';
    }
  }

  wrapItemStatus(wrap: WrapInfo): string {
    if (wrap.targetConfirmed) {
      return WrapStatus.CONFIRMED;
    } else if (wrap.targetValid()) {
      return WrapStatus.CONFIRMING;
    } else if (this.waitingWraps[wrap.sourceTxn]) {
      return WrapStatus.WAITING;
    } else if (this.submittingWraps[wrap.sourceTxn]) {
      if (this.submittingWraps[wrap.sourceTxn] + 60000 < window.performance.now()) {
        delete this.submittingWraps[wrap.sourceTxn];
      }
      return WrapStatus.SUBMITING;
    } else {
      if (!this.validator.signing(wrap.account, wrap.height)) {
        return WrapStatus.NONE;
      }

      const percent = this.validator.signedPercent(wrap.account, wrap.height);
      if (percent > 51) return WrapStatus.COLLECTED;
      return WrapStatus.COLLECTING;
    }
  }

  wrapShowSpin(wrap: WrapInfo): boolean {
    const status = this.wrapItemStatus(wrap);
    if (status === WrapStatus.COLLECTING || status === WrapStatus.WAITING
      || status === WrapStatus.SUBMITING) {
      return true;
    }
    return false;
  }

  wrapSignedPercent(wrap: WrapInfo): number {
    return this.validator.signedPercent(wrap.account, wrap.height);
  }

  wrapItemConfirms(wrap: WrapInfo): string {
    const info = this.validator.chainInfo(wrap.toChain as ChainStr);
    if (!info || !wrap.targetValid()) return '';

    const targetHeight = wrap.targetHeight.toNumber();
    if (targetHeight > info.height) {
      return `0 / ${info.confirmations}`;
    } else {
      return `${info.height - targetHeight} / ${info.confirmations}`;
    }
  }

  wrapShowStatus(wrap: WrapInfo): string {
    const status = this.wrapItemStatus(wrap);
    let msg = '';
    let param: any;
    if (status === WrapStatus.COLLECTING) {
      msg = marker(`Collecting signatures ({ percent }%)`);
      param = { 'percent': this.wrapSignedPercent(wrap) };
    } else if (status === WrapStatus.COLLECTED) {
      msg = marker('Signatures collected ({ percent }%), click to submit the transaction to { chain }');
      param = {
        'percent': this.validator.signedPercent(wrap.account, wrap.height),
        'chain': ChainHelper.toChainShown(wrap.toChain),
      };
    } else if (status === WrapStatus.WAITING) {
      msg = marker('Waiting');
    } else if (status === WrapStatus.SUBMITING) {
      msg = marker('Submiting transaction to { chain }');
      param = { 'chain': ChainHelper.toChainShown(wrap.toChain) }
    } else if (status === WrapStatus.CONFIRMED) {
      msg = marker('Success');
    }

    if (!msg) return '';
    this.translate.get(msg, param).subscribe(res => msg = res);    
    return msg;
  }

  wrapSubmit(wrap: WrapInfo) {
    if (!this.walletConnected(wrap.toChain as ChainStr)) {
      let msg = marker(`Please connect your web3 wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (ChainHelper.isEvmChain(wrap.toChain)) {
      const error = this.wrapToEvmChain(wrap, error => {
        delete this.waitingWraps[wrap.sourceTxn];
        if (!error) {
          this.submittingWraps[wrap.sourceTxn] = window.performance.now();
        }
      });
      if (!error) {
        this.waitingWraps[wrap.sourceTxn] = true;
      }
    } else {
      console.error(`Unsupported chain: ${wrap.toChain}`);
      return;
    }
  }

  wrapRetry(wrap: WrapInfo) {
    if (!this.wrapAssetWidget) return;
    this.wrapAssetWidget.clearAmount();
    this.wrapAssetWidget.selectAssetByTokenAddress(wrap.chain, wrap.address);  
    this.selectedWrapTargetChain = wrap.toChain;
    this.wrapSubmit(wrap);
  }

  wrapToEvmChain(wrap: WrapInfo, callback: (error: boolean) => void): boolean {
    if (!this.web3.connected(wrap.toChain as ChainStr)) return true;
    const fee = this.getFee(wrap.toChain);
    if (!fee) return true;
    let signatures = this.validator.transferSignatures(wrap.account, wrap.height, 51);
    if (!signatures) {
      console.error(`MapComponent::wrapToEvmChain: failed to get signatures`);
      return true;
    }
    signatures = ZX + signatures;

    if (wrap.type == TokenType._20) {
      try {
        this.web3.evmCoreContract.methods.wrapERC20Token(wrap.chainId, wrap.addressRaw.to0xHex(),
          wrap.fromRaw.to0xHex(), wrap.toAccountRaw.toEthAddress(),
          ZX + wrap.sourceTxn.toLowerCase(), wrap.height, wrap.value.to0xHex(), signatures).send({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
            callback(false);
          }).catch((error: any) => {
            console.error('wrapERC20Token error:', error);
            callback(true);
          });
      } catch (e) {
        console.error('wrapERC20Token exception:', e);
        return true;
      }
    } else if (wrap.type == TokenType._721) {
      try {
        this.web3.evmCoreContract.methods.wrapERC721Token(wrap.chainId, wrap.addressRaw.to0xHex(),
        wrap.fromRaw.to0xHex(), wrap.toAccountRaw.toEthAddress(),
        ZX + wrap.sourceTxn.toLowerCase(), wrap.height, wrap.value.to0xHex(), signatures).send({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
            callback(false);
          }).catch((error: any) => {
            console.error('wrapERC721Token error:', error);
            callback(true);
          });
      } catch (e) {
        console.error('wrapERC721Token exception:', e);
        return true;
      }
    } else {
      console.error('wrapToEvmChain: unknown token type ', wrap.type);
      return true;
    }

    let msg = marker(`[2/2] Submitting {wrap} transaction to {chain}, please check and approve it in your web3 wallet`);
    const param = { 'wrap': 'WRAP', 'chain': ChainHelper.toChain(wrap.toChain) };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg);
    return false;
  }

  unwrapItemAmount(unwrap: UnwrapInfo): string {
    const symbol = this.queryTokenSymbol(unwrap.chain, unwrap.address);
    if (!symbol) return '';
    let decimals = unwrap.decimals;
    if (unwrap.type === TokenType._20) {
      if (decimals === undefined) {
        decimals = this.queryTokenDecimals(unwrap.chain, unwrap.address);
        if (decimals === undefined) {
          return '';
        }
      }
      return `${unwrap.value.toBalanceStr(decimals)} ${symbol}`;
    } else if (unwrap.type === TokenType._721) {
      return `1 ${symbol}`;
    } else {
      return '';
    }
  }

  unwrapItemSuccess(unwrap: UnwrapInfo): boolean {
    return unwrap.confirmed;
  }

  unwrapItemConfirms(unwrap: UnwrapInfo): string {
    const info = this.validator.chainInfo(unwrap.fromChain as ChainStr);
    if (!info) return '';
    if (unwrap.height > info.height) {
      return `0 / ${info.confirmations}`;
    } else {
      return `${info.height - unwrap.height} / ${info.confirmations}`;
    }
  }

  noUnwraps(): boolean {
    if (!this.selectedUnwrapSourceChain) return false;
    return this.token.noUnwraps(this.selectedUnwrapSourceChain);
  }

  moreUnwraps(): boolean {
    if (!this.selectedUnwrapSourceChain) return false;
    return this.token.moreUnwraps(this.selectedUnwrapSourceChain)
  }

  loadMoreUnwraps() {
    if (!this.selectedUnwrapSourceChain) return;
    this.token.loadMoreUnwraps(this.selectedUnwrapSourceChain);
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

  private hasWaitingWraps(): boolean {
    for (let i in this.waitingWraps) {
      return true;
    }
    return false;
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

}

enum Panel {
  WRAP = 'wrap',
  WRAP_CONFIRM = 'wrap_confirm',
  UNWRAP = 'unwrap',
  UNWRAP_CONFIRM = 'unwrap_confirm',
}

enum ApproveStatus {
  NONE = '',
  CHECKING = 'checking',
  WAITING = 'waiting',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ERROR = 'error',
}

class WrapContractStatus {
  lastQuery?: number;
  created?: boolean;
  address?: string;
  waiting?: boolean;
  submitAt?: number;

  submitting(): boolean {
    if (!this.submitAt) return false;
    return this.submitAt + 60000 > window.performance.now();
  }
}

class WrapContractStatusContainer {
  private entries: {
    [originalChain: string]: {
      [originalContract: string]: {
        [targetChain: string]: WrapContractStatus
      }
    }
  } = {};

  get(chain: string, address: string, targetChain: string): WrapContractStatus {
    return this.entries[chain]?.[address]?.[targetChain];
  }

  add(chain: string, address: string, targetChain: string, status: WrapContractStatus) {
    if (!this.entries[chain]) {
      this.entries[chain] = {};
    }
    if (!this.entries[chain][address]) {
      this.entries[chain][address] = {}
    }
    this.entries[chain][address][targetChain] = status;
  }
}

enum WrapStatus {
  NONE = '',
  COLLECTING = 'collecting',
  COLLECTED = 'collected',
  WAITING = 'waiting',
  SUBMITING = 'submitting',
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
}