import { Component, OnInit, OnDestroy } from '@angular/core';

import { U64 } from '../../services/util.service'
import { ServerService } from '../../services/server.service';
import { WalletsService, Account } from '../../services/wallets.service';
import { BscWeb3Service } from '../../services/bsc-web3.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { NotificationService, NotificationId } from '../../services/notification.service';
import { LiquidityRewardService, LpItem } from '../../services/liquidity-reward.service';

@Component({
  selector: 'app-liquidity-reward',
  templateUrl: './liquidity-reward.component.html',
  styleUrls: ['./liquidity-reward.component.css']
})
export class LiquidityRewardComponent implements OnInit, OnDestroy {
  public selectedRecipient = '';

  constructor(
    private translate: TranslateService,
    private notification: NotificationService,
    private server: ServerService,
    private wallets: WalletsService,
    private web3: BscWeb3Service,
    private lr: LiquidityRewardService
  ) {
    this.selectedRecipient = this.wallets.selectedAccountAddress();
    if (this.bscAccount()) {
      this.lr.addAccount(this.bscAccount());
    }

    const wallet = this.wallets.selectedWallet();
    if (wallet) {
      wallet.accounts.forEach(a => this.lr.addAccount(a.address()));
    }

    this.web3.accountChanged$.subscribe(e => {
      if (e.from) this.lr.delAccount(e.from);
      if (e.to) this.lr.addAccount(e.to);
    });

    this.lr.recipientOpResult$.subscribe(e => {
      if (!e.error || !e.info) return;
      let msg = e.info;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
    });
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.lr.clear();
  }

  bscAccount(): string {
    return this.web3.account();
  }

  connected(): boolean {
    return this.web3.connected();
  }

  async connectWallet(): Promise<any> {
    await this.web3.connectWallet();
    if (this.bscAccount()) {
      this.lr.addAccount(this.bscAccount());
    }
  }

  async disconnectWallet(): Promise<any> {
    if (this.bscAccount()) {
      this.lr.delAccount(this.bscAccount());
    }
    await this.web3.disconnectWallet();
  }

  raiAccounts(): Account[] {
    return this.wallets.selectedWallet()?.accounts || [];
  }

  recipient(): string {
    return this.lr.getRecipient(this.bscAccount());
  }

  async sendSigningRequest(signer: string, to: string, timestamp: string): Promise<any> {
    try {
      const msg = `recipient:${to},timestamp=${timestamp}`;
      return await this.web3.web3?.eth.personal.sign(msg, signer, '');
    } catch (error) {
      console.log('sendSigningRequest error:', error);
    }
  }

  async setRecipient(): Promise<any> {
    if (!this.selectedRecipient) return;
    if (!this.connected()) return;
    const account = this.bscAccount();
    const recipient = this.selectedRecipient;

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

    const error = this.lr.setRecipient(account, recipient, timestamp, signature);
    if (error) {
      let msg = error;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
    }
  }

  lpItems(): LpItem[] {
    return this.lr.getLpItems();
  }

  lpItemsEmpty(): boolean {
    return this.lr.empty();
  }

}
