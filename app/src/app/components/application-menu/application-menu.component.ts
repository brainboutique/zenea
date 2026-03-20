import {
  Component,
  inject,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import {RouterLink, RouterLinkActive} from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
@Component({
  selector: 'app-application-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule, MatDialogModule, MatSnackBarModule, RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './application-menu.component.html',
  styleUrl: './application-menu.component.scss',
})
export class ApplicationMenuComponent {
  openMenu(trigger: MatMenuTrigger) {
    trigger.openMenu();
  }
  closeMenu(trigger: MatMenuTrigger) {
    trigger.closeMenu();
  }

}
