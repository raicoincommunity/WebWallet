import { Component, OnInit } from '@angular/core';
import { WalletsService } from 'src/app/services/wallets.service';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.css']
})
export class WelcomeComponent implements OnInit {

  constructor(private wallets: WalletsService) { }

  ngOnInit(): void {
  }

  configured(): boolean {
    return this.wallets.configured();
  }
}
