import { Component, OnInit} from '@angular/core';
import { BigNumber } from 'bignumber.js';
import { environment } from '../../../environments/environment';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { NotificationService } from '../../services/notification.service';
import { WalletsService, WalletErrorCode, Account, Amount } from '../../services/wallets.service';
import { U128, U256 } from '../../services/util.service';
import { BscBridgeService, BscMintItem, BscRedeemItem } from '../../services/bsc-bridge.service';
import { Block } from '../../services/blocks.service';
import { Web3Service } from '../../services/web3.service';

@Component({
  selector: 'app-bridge-bsc',
  templateUrl: './bridge-bsc.component.html',
  styleUrls: ['./bridge-bsc.component.css']
})
export class BridgeBscComponent implements OnInit {
  public activePanel = 0;
  public selectedFromAccount = '';
  public selectedToAccount = '';
  public inputRaiAmount = '';
  public inputBepAmount = '';
  public raiAmount = new U128(0);
  public bepAmount = new U128(0);
  public inputRaiStatus = 0;
  public inputBepStatus = 0;

  private autoMintTxns: {hash:string, account:string}[] = [];
  private mintingTxns: {hash:string, account:string, timeout:number}[] = [];
  private mintTimer: any = undefined;
  private mintTimeout = 20;

  constructor(
    private translate: TranslateService,
    private notification: NotificationService,
    private wallets: WalletsService,
    private bridge: BscBridgeService,
    private web3: Web3Service
  ) {
    const account = this.wallets.selectedAccount();
    if (account) {
      this.selectedFromAccount = account.address();
      this.selectedToAccount = account.address();
      this.bridge.addAccount(this.selectedFromAccount);
    }

    this.web3.accountChanged$.subscribe(e => {
      if (e.to) this.bridge.addAccount(e.to);
    });
  }

  ngOnInit(): void {
  }

  bscAccount(): string {
    return this.web3.account();
  }

  bscShortAccount(): string {
    const account = this.bscAccount();
    if (!account) return account;
    return account.substr(0, 7) + '...' + account.substr(-5);
  }

  bscAccountBalance(): string {
    let account = this.bscAccount();
    if (!account) return '';
    const balance = this.bridge.bscAccountBalance(account);
    account = account.substr(0, 7) + '...' + account.substr(-5);
    if (!balance) return account;
    const balance_str = balance.toBalanceStr(U128.RAI());
    return `${account} (${balance_str} RAI)`;
  }

  changeRaiAccount(event: any) {
    const account = event.target.value;
    if (!account) return;
    this.bridge.addAccount(account);
  }

  raiAccounts(): Account[] {
    return this.wallets.selectedWallet()?.accounts || [];
  }

  raiBalance(): Amount {
    return this.wallets.balance(this.selectedFromAccount);
  }

  connected(): boolean {
    return this.web3.connected();
  }

  async connectWallet(): Promise<any> {
    await this.web3.connectWallet();
  }

  async disconnectWallet(): Promise<any> {
    await this.web3.disconnectWallet();
  }

  setPanel(panel: number) {
    this.activePanel = panel;
  }

  contractAddress(): string {
    return environment.bsc_contract_address;
  }

  setRaiMaxAmount() {
    if (!this.selectedFromAccount) return;
    const amount = this.wallets.balance(this.selectedFromAccount);
    this.raiAmount = amount.value;
    this.inputRaiAmount = this.raiAmount.toBalanceStr(U128.RAI());
  }

  setBepMaxAmount() {
    if (!this.bscAccount()) return;
    const amount = this.bridge.bscAccountBalance(this.bscAccount());
    if (!amount) return;
    this.bepAmount = amount;
    this.inputBepAmount = this.bepAmount.toBalanceStr(U128.RAI());
  }

  syncRaiAmount() {
    try {
      if (!this.inputRaiAmount) {
        this.inputRaiStatus = 2;
        return;
      }
      const amount = new BigNumber(this.inputRaiAmount).mul(U128.RAI().toBigNumber());
      this.raiAmount = new U128(amount);
      if (this.raiAmount.lt(U128.RAI())) {
        this.inputRaiStatus = 2;
        return;
      }
      this.inputRaiStatus = 1;
    }
    catch (err) {
      this.inputRaiStatus = 2;
    }
  }

  syncBepAmount() {
    try {
      if (!this.inputBepAmount) {
        this.inputBepStatus = 2;
        return;
      }
      const amount = new BigNumber(this.inputBepAmount).mul(U128.RAI().toBigNumber());
      this.bepAmount = new U128(amount);
      if (this.bepAmount.eq(0)) {
        this.inputBepStatus = 2;
        return;
      }
      this.inputBepStatus = 1;
    }
    catch (err) {
      this.inputBepStatus = 2;
    }
  }

  convertToBep() {
    this.syncRaiAmount();
    if (this.inputRaiStatus !== 1) return;

    if (this.raiBalance().value.lt(this.raiAmount)) {
      let msg = marker('Not enough balance');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (!this.connected() || !this.web3 || !this.bscAccount()) return;

    const account = this.wallets.findAccounts(this.selectedFromAccount)[0];
    if (!account) return;

    const result = this.wallets.send(environment.bsc_bridge_address, this.raiAmount, this.bscAccount(), '', account);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    this.bridge.addMintBlock(result.block!);
    this.addAutoMintTxn(result.block!);
    let msg = marker(`Sending { amount } RAI to the bridge pool`);
    const param = { 'amount': this.inputRaiAmount };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);
    this.inputRaiAmount = '';
    this.raiAmount = new U128();
    this.inputRaiStatus = 0;
  }

  convertToRai() {
    this.syncBepAmount();
    if (this.inputBepStatus !== 1) return;

    if (!this.selectedToAccount) return;

    if (!this.connected()) return;

    this.sendRedeemRequest(this.selectedToAccount, this.bepAmount).then(_ => {
      this.bridge.updateBscAccountBalance(this.bscAccount());
    }).catch(_ => {});

    let msg = marker(`A redemption request of { amount } RAI was sent, please check and approve the transaction in your web3 wallet!`);
    const param = { 'amount': this.bepAmount.toBalanceStr(U128.RAI()) };
    this.translate.get(msg, param).subscribe(res => msg = res);
    this.notification.sendWarning(msg, {timeout:20 * 1000});
    this.inputBepAmount = '';
    this.bepAmount = new U128();
    this.inputBepStatus = 0;
  }

  async sendMintRequest(item: BscMintItem): Promise<any> {
    try {
      this.addMintingTxn(item);
      await this.web3.bscContract.methods.mint('0x' + item.source_txn.toHex(), item.to, item.amount.toDec(), '0x' + item.v.toHex(), '0x' + item.r.toHex(), '0x' + item.s.toHex()).send({ from: this.bscAccount() });
    } catch (error) {
      console.log('sendMintRequest error:', error);
    }
  }

  async sendRedeemRequest(to: string, amount: U128): Promise<any> {
    try {
      let publicKey = new U256();
      if (publicKey.fromAccountAddress(to)) return;
      await this.web3.bscContract.methods.redeem('0x' + publicKey.toHex(), '0x' + amount.toHex()).send(
        { from: this.bscAccount() }
      );
    } catch (error) {
      console.log('sendRedeemRequest error:', error);
    }
  }

  mintRetry(item: BscMintItem) {
    if (!this.connected() || !this.web3) {
      let msg = marker(`You need to connect a web3 wallet first!`);
      this.translate.get(msg).subscribe(res => msg = res);    
      this.notification.sendError(msg);
      return;
    }

    this.sendMintRequest(item).then(_ => {
      this.bridge.updateBscAccountBalance(this.bscAccount());
    }).catch(_ => {});

    let msg = marker(`A minting request of { amount } RAI was sent, please check and approve the transaction in your web3 wallet!`);
    const param = { 'amount': item.amount.toBalanceStr(U128.RAI()) };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg, {timeout:20 * 1000});
  }

  canMintRetry(item: BscMintItem): boolean {
    if (item.state !== 'paid') {
      return false;
    }

    const hash = item.source_txn.toHex().toLowerCase();
    if (this.autoMintTxns.find(i => i.hash === hash)) {
      return false;
    }

    if (this.mintingTxns.find(i => i.hash === hash)) {
      return false;
    }

    return true;
  }

  mintItems(): BscMintItem[] {
    if (!this.selectedFromAccount) return [];
    return this.bridge.mintItems(this.selectedFromAccount);
  }

  redeemItems(): BscRedeemItem[] {
    if (!this.bscAccount()) return [];

    return this.bridge.redeemItems(this.bscAccount())
  }

  success(item: BscMintItem | BscRedeemItem): boolean {
    switch (item.state) {
      case 'minting':
      case 'minted':
      case 'recording':
      case 'recorded':
      case 'sent':
        return true
      default:
        return false;
    }
  }

  burning(item: BscRedeemItem): boolean {
    return item.state === 'burning';
  }

  mintItemsEmpty(): boolean {
    if (!this.selectedFromAccount) return true;
    return this.bridge.mintItemsEmpty(this.selectedFromAccount);
  }

  mintItemsAll(): boolean {
    if (!this.selectedFromAccount) return true;

    return this.bridge.mintItemsAll(this.selectedFromAccount);
  }

  redeemItemsEmpty(): boolean {
    if (!this.bscAccount()) return true;
    return this.bridge.redeemItemsEmpty(this.bscAccount());
  }

  redeemItemsAll(): boolean {
    if (!this.bscAccount()) return true;

    return this.bridge.redeemItemsAll(this.bscAccount());
  }

  loadMoreMintItems() {
    if (!this.selectedFromAccount) return;
    this.bridge.increaseMintItemSize(this.selectedFromAccount, 10);
  }

  loadMoreRedeemItems() {
    if (!this.bscAccount()) return;
    this.bridge.increaseRedeemItemSize(this.bscAccount(), 10);
  }

  private ongoingMint() {
    if (!this.mintingTxns.length && !this.autoMintTxns && this.mintTimer) {
      clearInterval(this.mintTimer);
      this.mintTimer = undefined;
      return;
    }

    this.mintingTxns.forEach(i => i.timeout -= 1);
    this.mintingTxns = this.mintingTxns.filter(i => {
      if (i.timeout <= 0) return false;
      const item = this.bridge.mintItem(i.account, i.hash);
      if (!item) return false;

      return !this.success(item);
    });


    for (let i = 0; i < this.autoMintTxns.length; ++i) {
      const v = this.autoMintTxns[i];
      const item = this.bridge.mintItem(v.account, v.hash);
      if (!item || item.state != 'paid' || item.r.eq(0) || item.s.eq(0) || item.v.eq(0)) continue;

      if (!this.connected() || !this.web3) break;
      this.sendMintRequest(item).then(_ => {}).catch(_ => {});
      this.autoMintTxns.splice(i, 1);

      let msg = marker(`A minting request of { amount } RAI was sent, please check and approve the transaction in your web3 wallet!`);
      const param = { 'amount': item.amount.toBalanceStr(U128.RAI()) };
      this.translate.get(msg, param).subscribe(res => msg = res);    
      this.notification.sendWarning(msg, {timeout:20 * 1000});
      break;
    }
  }

  private addAutoMintTxn(block: Block) {
    const hash = block.hash().toHex().toLowerCase();
    if (this.autoMintTxns.find(x => x.hash == hash)) return;
    this.autoMintTxns.push({hash, account:block.account().toAccountAddress()});
    if (!this.mintTimer) {
      this.mintTimer = setInterval(() => this.ongoingMint(), 1000);
    }
  }

  private addMintingTxn(item: BscMintItem) {
    const hash = item.source_txn.toHex().toLowerCase();
    if (this.mintingTxns.find(x => x.hash == hash)) return;
    this.mintingTxns.push({hash, account:item.from.toLowerCase(), timeout:this.mintTimeout});
    if (!this.mintTimer) {
      this.mintTimer = setInterval(() => this.ongoingMint(), 1000);
    }
  }

  async cancel(): Promise<any> {
    this.inputRaiAmount = '';
    this.raiAmount = new U128();
    this.inputRaiStatus = 0;
    this.inputBepAmount = '';
    this.bepAmount = new U128();
    this.inputBepStatus = 0;
    await this.disconnectWallet();
  }

  copied() {
    let msg = marker(`Contract address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

}
