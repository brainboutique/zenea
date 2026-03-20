import { Component, afterNextRender, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { hasSeenCurrentWelcome, WelcomeComponent } from '../welcome/welcome.component';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButton, MatIcon, TranslateModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private readonly dialog = inject(MatDialog);

  constructor() {
    afterNextRender(() => {
      if (!hasSeenCurrentWelcome()) {
        this.dialog.open(WelcomeComponent, {
          width: '80vw',
          height: '80vh',
          maxWidth: '80vw',
          maxHeight: '80vh',
        });
      }
    });
  }
}
