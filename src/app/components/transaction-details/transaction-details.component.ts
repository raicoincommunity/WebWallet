import { Component, OnInit } from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import { BlocksService, BlockInfo } from '../../services/blocks.service';
import { U256 } from '../../services/util.service';

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
    private blocks: BlocksService
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

}
