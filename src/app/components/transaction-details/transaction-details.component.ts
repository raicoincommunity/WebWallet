import { Component, OnInit } from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import { BlocksService, BlockInfo } from '../../services/blocks.service';
import { U256 } from '../../services/util.service';
import { WalletsService } from '../../services/wallets.service';
import { TokenService, TokenBlock } from '../../services/token.service';

@Component({
  selector: 'app-transaction-details',
  templateUrl: './transaction-details.component.html',
  styleUrls: ['./transaction-details.component.css']
})
export class TransactionDetailsComponent implements OnInit {
  hash = ''
  blockInfo: BlockInfo | undefined;

  constructor(
    private route: ActivatedRoute,
    private blocks: BlocksService,
    private wallets: WalletsService,
    private token: TokenService
  ) { }

  ngOnInit(): void {
    this.hash = this.route.snapshot.params.hash;
    if (!this.hash) return;
    try {
      const hash = new U256(this.hash, 16);
      this.blockInfo = this.blocks.getBlock(hash);
    }
    catch {
    }
  }

  blockStatus(): string {
    if (!this.blockInfo) return '';
    return this.wallets.blockStatus(this.blockInfo.block);
  }

  showTokenStatus(): boolean {
    return !!this.getTokenBlock();
  }

  tokenStatus(): string {
    const block = this.getTokenBlock();
    if (!block) return '';
    const status = block.status.toLowerCase();
    if (status === 'success') {
      return status;
    }
    return `failed with "${status} (${block.statusCode.toDec()})"`;
  }

  private getTokenBlock(): TokenBlock | undefined {
    if (!this.blockInfo) return undefined;
    const block = this.blockInfo.block;
    return this.token.tokenBlock(block.account().toAccountAddress(), block.height());
  }

}
