import { Component, OnInit } from '@angular/core';
import { Router } from "@angular/router";
import { WalletsService } from '../../services/wallets.service';

@Component({
  selector: 'app-wallets',
  templateUrl: './wallets.component.html',
  styleUrls: ['./wallets.component.css']
})
export class WalletsComponent implements OnInit {

  constructor(private router: Router, private walletsService: WalletsService) { }

  ngOnInit(): void {
  }

  addNewWallet() {
    this.router.navigate(['/configure-wallet']);
  }

  wallets() {
    return this.walletsService.wallets;
  }

  selectedWalletIndex(): number {
    return this.walletsService.selectedWalletIndex();
  }

  changeWallet(id: string) {
    this.walletsService.selectWallet(id);
  }

}
