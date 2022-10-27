import { Component, OnInit } from '@angular/core';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { Receivable } from '../../services/blocks.service';
import { U256, ChainHelper, TokenSourceStr, TokenTypeStr, U128 } from '../../services/util.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenService, TokenReceivable } from '../../services/token.service';
import { SettingsService } from '../../services/settings.service';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-receive',
  templateUrl: './receive.component.html',
  styleUrls: ['./receive.component.css']
})
export class ReceiveComponent implements OnInit {
  checkedHashs: string[] = [];
  checkedKeys: string[] = [];
  checkedAll: boolean = false;
  activePanel: string = Panel.DEFAULT;
  selectedReceivable?: Receivable | TokenReceivable;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService, 
    private token: TokenService,
    private settings: SettingsService,
    private verified: VerifiedTokensService,
    private notification: NotificationService) { }

  ngOnInit(): void {
  }

  receivables(): Receivable[] {
    return this.wallets.receivables();
  }

  tokenReceivables(): TokenReceivable[] {
    return this.token.receivables();
  }

  formatTokenValue(receivable: TokenReceivable): string {
    return receivable.valueFormatted(
      this.queryTokenSymbol(receivable.token.chain, receivable.token.address)
    );
  }

  receive() {
    if (this.checkedHashs.length === 0 && this.checkedKeys.length === 0) {
      let msg = marker('Please select some items first');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
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
        this.wallets.tryInputPassword(() => { this.doReceive() });
        return;
      }
    }

    this.doReceive();
  }

  doReceive() {
    const a = this.wallets.selectedAccount();
    const w = this.wallets.selectedWallet();
    if (!a || !w) return;

    let error = false;
    let received = false;
    for (let hash of this.checkedHashs) {
      const errorCode = this.token.accountActionCheck(a, w);
      if (errorCode !== WalletErrorCode.SUCCESS && a.created()) {
        let msg = errorCode;
        this.translate.get(msg).subscribe(res => msg = res);    
        this.notification.sendError(`${msg} (${a.shortAddress()})`, { timeout: 20 * 1000 });
        error = true;
        break;
      }
      const result = this.wallets.receive(hash);
      if (result.errorCode !== WalletErrorCode.SUCCESS && result.errorCode !== WalletErrorCode.IGNORED) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        error = true;
        break;
      }
      received = true;
    }
    if (received) {
      const account = this.wallets.selectedAccount();
      if (account) {
        this.wallets.receivablesQuery(account);
      }
    }

    if (error) return;
    received = false;
    for (let key of this.checkedKeys) {
      const result = this.token.receive(this.selectedAccountAddress(), key);
      if (result.errorCode !== WalletErrorCode.SUCCESS && result.errorCode !== WalletErrorCode.IGNORED) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        break;
      }
      received = true;
    }
    if (received) {
      this.token.receivablesQuery(this.selectedAccountAddress());
    }
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  check(hash: U256) {
    const hashStr = hash.toHex();
    const index = this.checkedHashs.indexOf(hashStr);
    if (index === -1) this.checkedHashs.push(hashStr);
  }

  tokenCheck(key: string) {
    const index = this.checkedKeys.indexOf(key);
    if (index === -1) this.checkedKeys.push(key);
  }

  uncheck(hash: U256) {
    const hashStr = hash.toHex();
    const index = this.checkedHashs.indexOf(hashStr);
    if (index !== -1) this.checkedHashs.splice(index, 1);
  }

  tokenUncheck(key: string) {
    const index = this.checkedKeys.indexOf(key);
    if (index !== -1) this.checkedKeys.splice(index, 1);
  }

  checkAll() {
    this.receivables().forEach(r => this.check(r.hash));
    this.tokenReceivables().forEach(r => this.tokenCheck(r.key()));
    this.checkedAll = true;
  }

  uncheckAll() {
    this.checkedHashs = [];
    this.checkedKeys = [];
    this.checkedAll = false;
  }

  checked(hash: U256): boolean {
    let hashStr = hash.toHex();
    return this.checkedHashs.indexOf(hashStr) !== -1;
  }

  tokenChecked(key: string): boolean {
    return this.checkedKeys.indexOf(key) !== -1;
  }

  copied() {
    let msg = marker(`Account address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);        
    this.notification.sendSuccess(msg);
  }

  empty(): boolean {
    return this.wallets.receivables().length === 0 && this.token.receivables().length === 0;
  }

  address(): string {
    return this.wallets.selectedAccountAddress();
  }

  selectedReceivableSourceType(): string {
    if (!this.selectedReceivable) return '';
    if (this.selectedReceivable instanceof Receivable) return 'send';
    return this.selectedReceivable.sourceType;
  }

  selectedReceivableHash(): string {
    if (!this.selectedReceivable) return '';
    if (this.selectedReceivable instanceof Receivable) {
      return this.selectedReceivable.hash.toHex();
    }
    const sourceType = this.selectedReceivable.sourceType;
    if (sourceType == TokenSourceStr.MAP || sourceType == TokenSourceStr.UNWRAP) {
      return this.selectedReceivable.txHash.to0xHex();
    }
    return this.selectedReceivable.txHash.toHex();
  }

  sourceHashCopied() {
    let msg = marker(`Source hash copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedReceivableSender(): string {
    if (!this.selectedReceivable) return '';
    if (this.selectedReceivable instanceof Receivable) {
      return this.selectedReceivable.source.toAccountAddress();
    }
    return this.selectedReceivable.from;
  }

  senderCopied() {
    let msg = marker(`Sender copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedReceivableFromChain(): string {
    if (!this.selectedReceivable) return '';
    let chain;
    if (this.selectedReceivable instanceof Receivable) {
      chain = environment.current_chain;
    } else {
      chain = this.selectedReceivable.chain;
    }
    return ChainHelper.toChainShown(chain);
  }

  selectedReceivableTokenType(): string {
    if (!this.selectedReceivable) return '';
    if (this.selectedReceivable instanceof Receivable) {
      return 'N/A';
    } else {
      const token = this.selectedReceivable.token;
      if (ChainHelper.isNative(token.chain, token.addressRaw)) {
        return 'N/A';
      }
      return ChainHelper.tokenTypeShown(token.chain, token.type as TokenTypeStr);
    }
  }

  selectedReceivableOriginalChain(): string {
    if (!this.selectedReceivable) return '';
    let chain;
    if (this.selectedReceivable instanceof Receivable) {
      chain = environment.current_chain;
    } else {
      chain = this.selectedReceivable.token.chain;
    }
    return ChainHelper.toChainShown(chain);
  }

  selectedReceivableTokenAddress(): string {
    if (!this.selectedReceivable) return '';
    if (this.selectedReceivable instanceof Receivable) {
      return 'N/A';
    } else {
      const token = this.selectedReceivable.token;
      if (ChainHelper.isNative(token.chain, token.addressRaw)) {
        return 'N/A';
      }
      return token.address;
    }
  }

  tokenAddressCopied() {
    let msg = marker(`Token address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedReceivableSentAt(): number {
    const receivable = this.selectedReceivable;
    if (!receivable) return 0;
    if (receivable instanceof Receivable) {
      return receivable.timestamp.toNumber();
    } else {
      const source = receivable.sourceType;
      if (source == TokenSourceStr.MAP || source == TokenSourceStr.UNWRAP) {
        const timestamp = this.token.txTimestamp(receivable.chain, receivable.txHash.to0xHex());
        if (!timestamp) {
          this.token.queryTxTimestamp(receivable.chain, receivable.txHash.to0xHex(),
            receivable.blockHeight.toNumber());
          return 0;
        }
        return timestamp;
      } else {
        return +receivable.block!.timestamp;
      }
    }
  }

  selectedReceivableAmount(): string {
    const receivable = this.selectedReceivable;
    if (!receivable) return '';
    if (receivable instanceof Receivable) {
      return receivable.amount.toBalanceStr(U128.RAI()) + ' RAI';
    }
    const token = receivable.token;
    const symbol = this.queryTokenSymbol(token.chain, token.address);
    if (!symbol) return '';
    if (token.type == TokenTypeStr._20) {
      return `${receivable.value.toBalanceStr(token.decimals)} ${symbol}`;
    } else if (token.type == TokenTypeStr._721) {
      return `1 ${symbol} (${receivable.value.toDec()})`;
    } else {
      return '';
    }
  }

  selectedReceivableRecipient(): string {
    const receivable = this.selectedReceivable;
    if (!receivable) return '';
    if (receivable instanceof Receivable) {
      return this.wallets.selectedAccountAddress();
    }
    return receivable.to;
  }

  recipientCopied() {
    let msg = marker(`Recipient copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectReceivable(receivable: Receivable | TokenReceivable) {
    this.selectedReceivable = receivable;
    this.activePanel = Panel.DETAILS;
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

}

enum Panel {
  DEFAULT = '',
  DETAILS = 'details',
}