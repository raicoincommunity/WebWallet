import { Component, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import { NotificationService } from '../../services/notification.service';
import { WalletsService, Amount } from '../../services/wallets.service';
import { Block, BlockInfo } from '../../services/blocks.service';
import { ServerService } from '../../services/server.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { AliasService } from '../../services/alias.service';

@Component({
  selector: 'app-account-details',
  templateUrl: './account-details.component.html',
  styleUrls: ['./account-details.component.css']
})
export class AccountDetailsComponent implements OnInit {

  address: string = '';
  empty = true;
  finished = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private translate: TranslateService,
    private wallets: WalletsService,
    private server: ServerService,
    private alias: AliasService,
    private notification: NotificationService) {

  }

  ngOnInit(): void {
    this.address = this.route.snapshot.params.address;
    if (!this.address.startsWith('rai_') || this.address.length !== 64) return;
    if (!this.wallets.getRecentBlocksSize(this.address)) {
      this.wallets.setRecentBlocksSize(10, this.address);
    }
    this.alias.addAccount(this.address);
  }

  copied() {
    let msg = marker(`Account address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  balance(): Amount {
    return this.wallets.balance(this.address);
  }

  pending(): Amount {
    return this.wallets.pending(this.address);
  }

  receivable(): Amount {
    return this.wallets.receivable(this.address);
  }

  representative(): string {
    return this.wallets.representative(this.address);
  }

  blocks(): BlockInfo[] {
    let blocks = this.wallets.recentBlocks(this.address);
    this.empty = blocks.length === 0;
    this.finished = this.empty || blocks[blocks.length - 1].block.height().eq(0);
    return blocks;
  }

  credit(): number {
    return this.wallets.credit(this.address);
  }

  dailyTxns(): string {
    let headTimestamp = this.wallets.headTimestamp(this.address);
    if (headTimestamp === 0) return '';
    let counter = this.wallets.headCounter(this.address);
    let now = this.server.getTimestamp();
    let credit = this.credit();
    let total = credit * 20;
    if (headTimestamp - (headTimestamp % 86400) === now - (now % 86400)) {
      return `${counter} / ${total}`;
    }
    else {
      return `0 / ${total}`;
    }
  }

  status(block: Block) {
    return this.wallets.blockStatus(block);
  }

  loadMore() {
    let size = this.wallets.getRecentBlocksSize(this.address);
    this.wallets.setRecentBlocksSize(size + 10, this.address);
  }

  getAlias(): string {
    if (!this.address) return '';
    return this.alias.alias(this.address);
  }

  dnsValid(): boolean {
    if (!this.address) return false;
    if (!this.alias.dns(this.address)) return false;
    if (!this.alias.verified(this.address)) return false;
    return this.alias.dnsValid(this.address);
  }

  dnsInvalid(): boolean {
    if (!this.address) return false;
    if (!this.alias.dns(this.address)) return false;
    if (!this.alias.verified(this.address)) return false;
    return !this.alias.dnsValid(this.address);
  }
}
