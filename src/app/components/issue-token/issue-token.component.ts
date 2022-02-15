import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject} from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { U8, U256, ExtensionTypeStr, ExtensionTokenOpStr, TokenType, TokenHelper } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenService, AccountTokenId, AccountTokenInfo } from '../../services/token.service';
import { environment } from '../../../environments/environment';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-issue-token',
  templateUrl: './issue-token.component.html',
  styleUrls: ['./issue-token.component.css']
})
export class IssueTokenComponent implements OnInit {
  public selectedTokenType = 'RAI-20';
  public inputTokenName = '';
  public inputTokenSymbol = '';
  public inputDecimals = '';
  public inputInitSupply = '';
  public inputCapSupply = '';
  public inputMintable = true;
  public inputBurnable = true;
  public inputCirculable = true;
  public inputBaseUri = '';
  public activePanel = '';
  public inputMintAmount = '';
  public inputMintTokenId = '';
  public inputMintTokenUri = '';
  public inputBurnAmount = '';
  public selectedBurnTokenId = '';
  public inputBurnTokenUri = '';

  public tokenNameStatus = 0;
  public tokenSymbolStatus = 0;
  public mintAmountStatus = 0;
  public mintTokenIdStatus = 0;
  public burnAmountStatus = 0;

  private decimals = new U8(18);
  private initSupply = new U256(0);
  private capSupply = new U256(0);
  private mintAmount = new U256(0);
  private mintTokenId : U256 | null = null;
  private burnAmount = new U256(0);
  private burnTokenId = new U256(0);

  private mintTokenIdSubject = new Subject<string>();

  @ViewChild('elemTokenName') elemTokenName : ElementRef | null = null;
  @ViewChild('elemTokenSymbol') elemTokenSymbol : ElementRef | null = null;

  constructor(
    private router: Router,
    private translate: TranslateService,
    private wallets: WalletsService,
    private token: TokenService,
    private settings: SettingsService,
    private notification: NotificationService) {
  }

  ngOnInit(): void {
    this.token.addAccount(this.selectedAccountAddress());
    this.token.issuer$.subscribe(x => {
      if (x.account !== this.selectedAccountAddress()) return;
      this.updatePanel();
    });

    this.token.accountSynced$.subscribe(x => {
      if (x.account !== this.selectedAccountAddress()) return;
      this.updatePanel();
    });

    this.updatePanel();

    this.mintTokenIdSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe(
      _ => {
        this.syncMintTokenId();
      }
    );

    this.token.tokenId$.subscribe(result => {
      if (result.address !== this.address()) return;
      if (!this.mintTokenId || !result.id.eq(this.mintTokenId)) return;
      try {
        const id = new U256(this.inputMintTokenId);
        if (id.eq(this.mintTokenId)) {
          this.mintTokenIdStatus = result.existing ? 2 : 1;
        }
      } catch (err) {
      }
    });
  }

  updatePanel() {
    if (!this.synced()) {
      this.activePanel = ActivePanel.DEFUALT;
    }

    if (this.token.issuerQueried(this.selectedAccountAddress())) {
      if (!this.token.issued(this.selectedAccountAddress())) {
        this.activePanel = ActivePanel.CREATE;
        return;
      }
    }
    this.activePanel = ActivePanel.DEFUALT;
  }

  synced(): boolean {
    return this.token.synced(this.selectedAccountAddress());
  }

  mintTokenIdChanged() {
    this.inputMintTokenId = this.inputMintTokenId.trim();
    this.mintTokenIdSubject.next(this.inputMintTokenId);
  }

  mintTokenUriChanged() {
    this.inputMintTokenUri = this.inputMintTokenUri.trim();

    if (this.baseUri() && this.inputMintTokenUri.startsWith(this.baseUri())) {
      this.inputMintTokenUri = this.inputMintTokenUri.substr(this.baseUri().length);
    }
  }

  burnTokenIdChanged(selected: string) {
    if (!selected) return;
    this.inputBurnTokenUri = this.tokenUri(selected);
  }

  loadMoreBurnTokenIds() {
    const size = this.token.getTokenIdsSize(environment.current_chain, 
    this.address(), this.address());
    this.token.setTokenIdsSize(environment.current_chain, 
    this.address(), size + 100, this.address());
  }

  hasMoreTokenIds(): boolean {
    const info = this.accountTokenInfo();
    if (!info) return false;
    return info.hasMoreTokenIds();
  }

  toggleInputMintable() {
    this.inputMintable = !this.inputMintable;
  }

  toggleInputBurnable() {
    this.inputBurnable = !this.inputBurnable;
  }

  toggleInputCirculable() {
    this.inputCirculable = !this.inputCirculable;
  }

  checkTokenName() {
    this.tokenNameStatus = this.inputTokenName === '' ? 1 : 0;
  }

  checkTokenSymbol() {
    this.tokenSymbolStatus = this.inputTokenSymbol === '' ? 1 : 0;
  }

  syncDecimals(): boolean {
    try {
      if (this.inputDecimals === '') {
        this.decimals = new U8(18);
        return false;
      }
      this.decimals = new U8(new BigNumber(this.inputDecimals));
      return false;
    }
    catch (err) {
      return true;
    }
  }

  syncInitSupply(): boolean {
    try {
      if (this.inputInitSupply === '' || this.inputInitSupply === '0') {
        this.initSupply = new U256(0);
        return false;
      }
  
      const decimalsValue = new BigNumber(10).pow(this.decimals.toNumber());
      this.initSupply =
        new U256(new BigNumber(this.inputInitSupply).mul(decimalsValue));
      return false;
    }
    catch (err) {
      return true;
    }
  }

  syncCapSupply(): boolean {
    try {
      if (this.inputCapSupply === '' || this.inputCapSupply === '0') {
        this.capSupply = new U256(0);
        return false;
      }
  
      if (this.selectedTokenType === 'RAI-20') {
        const decimalsValue = new BigNumber(10).pow(this.decimals.toNumber());
        this.capSupply =
          new U256(new BigNumber(this.inputCapSupply).mul(decimalsValue));
        if (!this.capSupply.eq(0)) {
          if (this.capSupply.lt(this.initSupply)) {
            return true;
          }
        }
      } else if (this.selectedTokenType === 'RAI-721') {
        this.capSupply = new U256(new BigNumber(this.inputCapSupply));
      } else {
        return true;
      }
      return false;
    }
    catch (err) {
      return true;
    }
  }

  getDecimals(): string {
    return this.decimals.toDec();
  }

  getInitSupply(): string {
    if (this.selectedTokenType === 'RAI-20') {
      return this.initSupply.toBalanceStr(this.decimals) + ' ' + this.inputTokenSymbol;
    } else if (this.selectedTokenType === 'RAI-721') {
      return '0 ' + this.inputTokenSymbol;
    } else {
      return '';
    }
  }

  getCapSupply(): string {
    if (this.capSupply.toBigNumber().eq(0))
    {
      let msg = marker(`Unlimited`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    if (this.selectedTokenType === 'RAI-20') {
      return this.capSupply.toBalanceStr(this.decimals) + ' ' + this.inputTokenSymbol;
    } else if (this.selectedTokenType === 'RAI-721') {
      return this.capSupply.toBalanceStr(new U8(0)) + ' ' + this.inputTokenSymbol;
    } else {
      return '';
    }
  }

  getMintable(): string {
    if (this.selectedTokenType === 'RAI-721')
    {
      return this.boolToString(true);
    }
    return this.boolToString(this.inputMintable);
  }

  getBurnable(): string {
    return this.boolToString(this.inputBurnable);
  }

  getCirculable(): string {
    return this.boolToString(this.inputCirculable);
  }

  create() {
    this.inputTokenName = this.inputTokenName.trim();
    if (this.inputTokenName === '') {
      this.tokenNameStatus = 1;
      if (this.elemTokenName) {
        this.elemTokenName.nativeElement.focus();
      }
      return;
    }

    this.inputTokenSymbol = this.inputTokenSymbol.trim();
    if (this.inputTokenSymbol === '') {
      this.tokenSymbolStatus = 1;
      if (this.elemTokenSymbol) {
        this.elemTokenSymbol.nativeElement.focus();
      }
      return;
    }

    this.inputDecimals = this.inputDecimals.trim();
    this.inputInitSupply = this.inputInitSupply.trim();
    this.inputCapSupply = this.inputCapSupply.trim();
    this.inputBaseUri = this.inputBaseUri.trim();

    if (this.selectedTokenType === 'RAI-20') {
      if (this.syncDecimals()) return;
      if (this.syncInitSupply()) return;
    }
    if (this.syncCapSupply()) return;

    if (this.selectedTokenType === 'RAI-20') {
      if (!this.inputMintable && this.initSupply.eq(0)) {
        let msg = marker(`Please input a non-zero initial supply or enable mintable option`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
      if (!this.capSupply.eq(0) && this.capSupply.lt(this.initSupply)) {
        let msg = marker(`The cap supply can not be less than initial supply`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else if (this.selectedTokenType === 'RAI-721') {
      // pass
    } else {
      return;
    }

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => this.activePanel = ActivePanel.CONFIRM_CREATION);
        return;
      }
    }

    this.activePanel = ActivePanel.CONFIRM_CREATION;
  }

  confirmCreation() {
    let value = {};
    if (this.selectedTokenType === 'RAI-20') {
      value = {
        op: ExtensionTokenOpStr.CREATE,
        type: '20',
        name: this.inputTokenName,
        symbol: this.inputTokenSymbol,
        init_supply: this.initSupply.toDec(),
        cap_supply: this.capSupply.toDec(),
        decimals: this.decimals.toDec(),
        burnable: this.inputBurnable ? 'true' : 'false',
        mintable: this.inputMintable ? 'true' : 'false',
        circulable: this.inputCirculable ? 'true' : 'false'
      };
    } else if (this.selectedTokenType === 'RAI-721') {
      value = {
        op: ExtensionTokenOpStr.CREATE,
        type: '721',
        name: this.inputTokenName,
        symbol: this.inputTokenSymbol,
        base_uri: this.inputBaseUri,
        cap_supply: this.capSupply.toDec(),
        burnable: this.inputBurnable ? 'true' : 'false',
        circulable: this.inputCirculable ? 'true' : 'false'
      }
    } else {
      console.log(`confirmCreation:Unknown type=${this.selectedTokenType}`);
      return;
    }

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent token creation block!`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

    this.activePanel = ActivePanel.DEFUALT;
    this.inputTokenName = '';
    this.inputTokenSymbol = '';
    this.inputDecimals = '';
    this.inputInitSupply = '';
    this.inputCapSupply = '';
    this.inputMintable = true;
    this.inputBurnable = true;
    this.inputCirculable = true;
    this.inputBaseUri = '';
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  mint() {
    const info = this.token.tokenInfo(this.address());
    if (!info) return;

    if (info.type === TokenType._20) {
      this.syncMintAmount();
      if (this.mintAmountStatus !== 1) return;

    } else if (info.type === TokenType._721) {
      this.syncMintTokenId();
      if (this.mintTokenIdStatus !== 1) return;
    } else {
      console.log(`mint:Unknown type=${info.type}`);
      return;
    }

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => {this.activePanel = ActivePanel.CONFIRM_MINT});
        return;
      }
    }

    this.activePanel = ActivePanel.CONFIRM_MINT;  
  }

  confirmMint() {
    const info = this.token.tokenInfo(this.address());
    if (!info) return;

    let value: any = {
      op: ExtensionTokenOpStr.MINT,
      type: TokenHelper.toTypeStr(info.type),
      to: this.address()
    };
    if (info.type === TokenType._20) {
      value.value = this.mintAmount.toDec();
    } else if (info.type === TokenType._721) {
      value.value = this.mintTokenId?.toDec();
      value.uri = this.inputMintTokenUri;
    } else {
      console.log(`confirmMint:Unknown type=${info.type}`);
      return;
    }

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent token mint block!`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

    this.activePanel = ActivePanel.DEFUALT;
    this.inputMintAmount = '';
    this.inputMintTokenId = '';
    this.inputMintTokenUri = '';
    this.mintTokenIdStatus = 0;
    this.mintAmountStatus = 0;
    this.mintTokenId = null;
    this.mintAmount = new U256(0);

    if (this.settings.getAutoReceive().enable) {
      this.router.navigate([`/account/${this.address()}`]);
    } else {
      this.router.navigate([`/receive`]);
    }
  }

  burn() {
    const info = this.token.tokenInfo(this.address());
    if (!info) return;

    if (info.type === TokenType._20) {
      this.syncBurnAmount();
      if (this.mintAmountStatus !== 1) return;

    } else if (info.type === TokenType._721) {
      const error = this.syncBurnTokenId();
      if (error) return;
    } else {
      console.log(`burn:Unknown type=${info.type}`);
      return;
    }

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => {this.activePanel = ActivePanel.CONFIRM_BURN});
        return;
      }
    }

    this.activePanel = ActivePanel.CONFIRM_BURN;  
  }

  confirmBurn() {
    const info = this.token.tokenInfo(this.address());
    if (!info) return;

    let value: any = {
      op: ExtensionTokenOpStr.BURN,
      type: TokenHelper.toTypeStr(info.type),
    };
    if (info.type === TokenType._20) {
      value.value = this.burnAmount.toDec();
    } else if (info.type === TokenType._721) {
      value.value = this.burnTokenId.toDec();
    } else {
      console.log(`confirmBurn:Unknown type=${info.type}`);
      return;
    }

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent token burn block!`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

    this.activePanel = ActivePanel.DEFUALT;
    this.inputBurnAmount = '';
    this.selectedBurnTokenId = '';
    this.inputBurnTokenUri = '';
    this.burnAmountStatus = 0;
    this.burnAmount = new U256(0);
    this.burnTokenId = new U256(0);

    this.router.navigate([`/account/${this.address()}`]);
  }

  showMintAmount(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.type === TokenType._20) {
      return this.mintAmount.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else if (info.type === TokenType._721) {
      return '1 ' + info.symbol;
    } else {
      return '';
    }
  }

  showBurnAmount(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.type === TokenType._20) {
      return this.burnAmount.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else if (info.type === TokenType._721) {
      return '1 ' + info.symbol;
    } else {
      return '';
    }
  }

  mintTotalSupply(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.type === TokenType._20) {
      const supply = info.totalSupply.plus(this.mintAmount);
      return supply.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else if (info.type === TokenType._721) {
      const supply = info.totalSupply.plus(1);
      return supply.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else {
      return '';
    }
  }

  burnTotalSupply(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.type === TokenType._20) {
      const supply = info.totalSupply.minus(this.burnAmount);
      return supply.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else if (info.type === TokenType._721) {
      const supply = info.totalSupply.minus(1);
      return supply.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else {
      return '';
    }
  }

  showMintTokenUri(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    let uri = this.inputMintTokenUri;
    if (info.baseUri) {
      uri = info.baseUri + uri;
    }
    if (uri) return uri;
    let msg = marker(`Not set`);
    this.translate.get(msg).subscribe(res => msg = res);
    return `<${msg}>`;
  }

  showBurnTokenUri(): string {
    return this.tokenUri(this.selectedBurnTokenId);
  }

  issued(): boolean {
    if (!this.selectedAccountAddress()) return false;
    if (!this.token.issuerQueried(this.selectedAccountAddress())) return false;
    return this.token.issued(this.selectedAccountAddress());
  }

  name(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.name;
  }

  symbol(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.symbol;
  }

  address(): string {
    return this.selectedAccountAddress();
  }

  copied() {
    let msg = marker(`Token address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  type(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.type === TokenType._20) {
      return 'RAI-20'
    } else if (info.type === TokenType._721) {
      return 'RAI-721';
    } else {
      return 'Unknown type';
    }
  }

  showDecimals(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.decimals.toDec();
  }

  totalSupply(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.totalSupply.toBalanceStr(info.decimals) + ' ' + info.symbol;
  }

  showCapSupply(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.capSupply.eq(0))
    {
      let msg = marker(`Unlimited`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    return info.capSupply.toBalanceStr(info.decimals) + ' ' + info.symbol;
  }

  mintable(): boolean {
    const info = this.token.tokenInfo(this.address());
    if (!info) return false;
    return info.mintable;
  }

  mintableStr(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return this.boolToString(info.mintable);
  }

  burnable(): boolean {
    const info = this.token.tokenInfo(this.address());
    if (!info) return false;
    return info.burnable;
  }

  burnableStr(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return this.boolToString(info.burnable);
  }

  circulableStr(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return this.boolToString(info.circulable);
  }

  baseUri(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info || info.type !== TokenType._721) return '';
    return info.baseUri;
  }

  holders(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.holders.toFormat();
  }

  transfers(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.transfers.toFormat();
  }

  swaps(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.swaps.toFormat();
  }

  setMaxMintAmount() {
    const amount = this.maxMintableStr();
    if (!amount) return;
    this.inputMintAmount = amount;
    this.syncMintAmount();
  }

  setMaxBurnAmount() {
    const amount = this.maxBurnableStr();
    if (!amount) return;
    this.inputBurnAmount = amount;
    this.syncBurnAmount();
  }

  mintAmountHint() {
    const info = this.token.tokenInfo(this.address());
    if (!info || !this.maxMintableStr()) {
      let msg = marker(`The amount to mint`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      let max = marker(`Max`);
      this.translate.get(max).subscribe(res => max = res);
      return `${max}: ${this.maxMintableStr()} ${info.symbol}`;
    }
  }

  burnAmountHint() {
    const info = this.accountTokenInfo();
    if (!info || !this.maxBurnableStr()) {
      let msg = marker(`The amount to burn`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      let max = marker(`Max`);
      this.translate.get(max).subscribe(res => max = res);
      return `${max}: ${this.maxBurnableStr()} ${info.symbol}`;
    }
  }

  burnableTokenIds(): AccountTokenId[] {
    return this.token.tokenIds(environment.current_chain, this.address(), this.address());
  }

  syncMintAmount() {
    const info = this.token.tokenInfo(this.address());
    if (!info) return;
    try {
      if (!this.inputMintAmount) {
        this.mintAmountStatus = 0;
        return;
      }
      const decimalsValue = new BigNumber(10).pow(info.decimals.toNumber());
      this.mintAmount =
        new U256(new BigNumber(this.inputMintAmount).mul(decimalsValue));
      if (this.mintAmount.eq(0) || this.mintAmount.gt(this.maxMintable())) {
        this.mintAmountStatus = 2;
        return;
      }
      this.mintAmountStatus = 1;
    }
    catch (err) {
      this.mintAmountStatus = 2;
    }
  }

  syncBurnAmount() {
    const info = this.accountTokenInfo();
    if (!info) {
      this.burnAmountStatus = 0;
      return;
    }

    if (!this.inputBurnAmount) {
      this.burnAmountStatus = 0;
      return;
    }

    try {
      const decimalsValue = new BigNumber(10).pow(info.decimals.toNumber());
      this.burnAmount =
        new U256(new BigNumber(this.inputBurnAmount).mul(decimalsValue));
      if (this.burnAmount.eq(0) || this.burnAmount.gt(info.balance)) {
        this.burnAmountStatus = 2;
        return;
      }
      this.burnAmountStatus = 1;
    }
    catch (err) {
      this.burnAmountStatus = 2;
    }
  }

  syncBurnTokenId(): boolean {
    if (!this.selectedBurnTokenId) {
      return true;
    }

    const info = this.accountTokenInfo();
    if (!info) return true;
    try {
      this.burnTokenId = new U256(this.selectedBurnTokenId);
      if (!info.ownTokenId(this.burnTokenId)) {
        return true;
      }
    } catch (err) {
      return true;
    }

    return false;
  }

  autoSetTokenId() {
    const id = this.token.autoTokenId(this.address());
    if (!id) return;
    this.inputMintTokenId = id.toDec();
    this.syncMintTokenId();
  }

  syncMintTokenId() {
    if (!this.inputMintTokenId) {
      this.mintTokenIdStatus = 0;
      return;
    }

    try {
      const id = new U256(this.inputMintTokenId);
      if (!this.mintTokenId || !id.eq(this.mintTokenId)) {
        this.mintTokenId = id;
        this.token.checkTokenId(this.address(), id);
        this.mintTokenIdStatus = 3;
      }
    } catch (err) {
      this.mintTokenIdStatus = 2;
    }
  }

  private tokenUri(id: string): string {
    const account_info = this.accountTokenInfo();
    if (!account_info) return '';
    const token_info = this.token.tokenInfo(this.address());
    if (!token_info) return '';

    try {
      const token_id = new U256(id);
      const item = account_info.tokenIds.find(x => x.id.eq(token_id));
      if (!item) return '';
      return `${token_info.baseUri}${item.uri}`;
    } catch (err) {
      return '';
    }
  }

  private accountTokenInfo(): AccountTokenInfo | undefined {
    return this.token.accountTokenInfo(environment.current_chain,
                                       this.address(), this.address());
  }

  private maxMintableStr(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    const amount = this.maxMintable();
    return amount.toBalanceStr(info.decimals, false);
  }

  private maxBurnableStr(): string {
    const info = this.accountTokenInfo();
    if (!info) return '';
    return info.balance.toBalanceStr(info.decimals, false);
  }

  private maxMintable(): U256 {
    const info = this.token.tokenInfo(this.address());
    if (!info) return new U256();
    const capSupply = info.capSupply.eq(0) ? U256.max() : info.capSupply;
    let amount = new U256();
    if (capSupply.gt(info.totalSupply)) {
      amount = capSupply.minus(info.totalSupply);
    }
    return amount;
  }

  private boolToString(bool: boolean): string {
    let msg = bool ? marker(`Yes`) : marker(`No`);
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

}

enum ActivePanel {
  DEFUALT = '',
  CREATE = 'create',
  CONFIRM_CREATION = 'confirm_creation',
  MINT = 'mint',
  CONFIRM_MINT = 'confirm_mint',
  BURN = 'burn',
  CONFIRM_BURN = 'confirm_burn'
}