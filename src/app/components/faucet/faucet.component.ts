import { Component, OnInit } from '@angular/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { WalletsService, Account } from '../../services/wallets.service';
import { BscWeb3Service } from '../../services/bsc-web3.service';
import { FaucetService, HistoryItem } from '../../services/faucet.service';
import { toChecksumAddress } from 'web3-utils'
import { U128 } from 'src/app/services/util.service';
import { NotificationService, NotificationId } from '../../services/notification.service';
import { U64 } from '../../services/util.service';
import { ServerService } from '../../services/server.service';

@Component({
  selector: 'app-faucet',
  templateUrl: './faucet.component.html',
  styleUrls: ['./faucet.component.css']
})
export class FaucetComponent implements OnInit {
  public selectedRaiAccount = '';

  constructor(
    private translate: TranslateService,
    private notification: NotificationService,
    private web3: BscWeb3Service,
    private server: ServerService,
    private wallets: WalletsService,
    private faucet: FaucetService
  ) {
    const account = this.wallets.selectedAccount();
    if (account) {
      this.selectedRaiAccount = account.address();
      this.faucet.addAccount(this.selectedRaiAccount);
    }

    this.faucet.bindResult$.subscribe(e => {
      if (e.error) {
        if (!e.info) return;
        let msg = e.info;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);  
      } else {
        let msg = marker('Successfully bound');
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendSuccess(msg);  
      }
    });

    this.faucet.claimResult$.subscribe(e => {
      if (e.error) {
        if (!e.info) return;
        let msg = e.info;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);  
      } else {
        let msg = marker('Successfully claimed { amount } RAI faucet');
        const param = { 'amount': e.amount?.toBalanceStr(U128.RAI()) };
        this.translate.get(msg, param).subscribe(res => msg = res);
        this.notification.sendSuccess(msg);  
      }
    });

    this.web3.accountChanged$.subscribe(e => {
      if (e.to) this.faucet.addAccount(e.to);
    });

   }

  ngOnInit(): void {
  }

  available(): boolean {
    const account = this.selectedRaiAccount;
    if (!account) return false;
    return this.faucet.synced(account) && this.faucet.waitingTime(account) === 0;
  }

  boundBscAccount(): string {
    const account = this.faucet.boundAccount(this.selectedRaiAccount);
    if (!account) return '';
    return toChecksumAddress(account);
  }

  connectedBscAccount(): string {
    const account = this.web3.account();
    if (!account) return '';

    const bound = this.faucet.boundAccount(account);
    if (!bound) return account;

    return `${account.substring(0, 6)}...${account.substring(38)} (bound to ${bound.substring(0, 8)}...${account.substring(60)})`;
  }

  boundWarning(): boolean {
    const account = this.web3.account();
    if (!account) return false;

    const bound = this.faucet.boundAccount(account);
    if (!bound) return false;

    return true;
  }

  raiAccounts(): Account[] {
    return this.wallets.selectedWallet()?.accounts || [];
  }

  changeRaiAccount(event: any) {
    const account = event.target.value;
    if (!account) return;
    this.faucet.addAccount(account);
  }

  maxClaimable(): string {
    const claimable = this.faucet.maxClaimable(this.selectedRaiAccount);
    return `${claimable.toBalanceStr(U128.RAI())} RAI`;
  }

  async bind(): Promise<any> {
    if (!this.selectedRaiAccount) return;
    if (!this.connected()) return;
    if (this.bound()) return;

    const account = this.web3.account();
    const recipient = this.selectedRaiAccount;
    if (!this.faucet.synced(account) || !this.faucet.synced(recipient)) {
      let msg = marker('The account is synchronizing, please try later');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      return;
    }

    const bound = this.faucet.boundAccount(account);
    if (bound) {
      let msg = marker('The BSC account has already been bound');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker('A signing request of the operation was sent, please check and sign the message in your web3 wallet!');
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000, identifier: NotificationId.BSC_SINGING_SENT });

    const timestamp = (new U64(this.server.getTimestamp())).toDec();
    const signature = await this.sendSigningRequest(account, recipient, timestamp);
    this.notification.remove(NotificationId.BSC_SINGING_SENT);
    if (!signature || !signature.startsWith('0x') || signature.length != 132) {
      let msg = marker('Signing message failed');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    this.faucet.bind(account, recipient, timestamp, signature);
  }

  bound(): boolean {
    if (!this.selectedRaiAccount) return false;
    const account = this.faucet.boundAccount(this.selectedRaiAccount);
    return !!account;
  }

  claim() {
    if (!this.bound()) return;
    if (!this.faucet.synced(this.selectedRaiAccount)) {
      let msg = marker('The account is synchronizing, please try later');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      return;
    }

    let claimable = this.claimable();
    const max = this.faucet.maxClaimable(this.selectedRaiAccount);
    if (max.lt(claimable)) {
      claimable = max;
    }
    if (claimable.eq(0)) return;
    if (this.faucet.waitingTime(this.selectedRaiAccount) > 0) return;

    this.faucet.claim(this.selectedRaiAccount, claimable);
  }

  claimable(): U128 {
    return this.faucet.claimable();
  }

  connected(): boolean {
    return this.web3.connected();
  }

  async connectWallet(): Promise<any> {
    await this.web3.connectWallet();
    if (this.web3.account()) {
      this.faucet.addAccount(this.web3.account());
    }
  }

  async disconnectWallet() {
    await this.web3.disconnectWallet();
  }

  waiting(): string {
    const secs = this.faucet.waitingTime(this.selectedRaiAccount);
    if (secs === 0) return '';

    return `(${new Date(secs * 1000).toISOString().substr(11, 8)})`;
  }

  async sendSigningRequest(signer: string, to: string, timestamp: string): Promise<any> {
    try {
      const msg = `bsc_faucet_to:${to},timestamp=${timestamp}`;
      return await this.web3.web3?.eth.personal.sign(msg, signer, '');
    } catch (error) {
      console.log('sendSigningRequest error:', error);
    }
  }

  historyItems(): HistoryItem[] {
    return this.faucet.historyItems();
  }

  historyEmpty(): boolean {
    return this.faucet.historySynced() && this.historyItems().length === 0;
  }

  historyMore(): boolean {
    return this.faucet.historySynced() && this.faucet.moreHistory();
  }

  loadMoreHistory() {
    this.faucet.loadMoreHisotry();
  }

}
