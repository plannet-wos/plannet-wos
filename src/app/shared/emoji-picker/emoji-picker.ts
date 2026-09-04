import { Component, EventEmitter, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * A small "insert an emoji" button + popup grid, for text fields that should visibly support
 * emojis (NAP's question/answer inputs — plain `<input>`/`<textarea>` already accept whatever
 * the OS's own emoji picker or keyboard types, but this makes that support discoverable and
 * usable from a desktop keyboard with no OS picker bound). Purely a convenience inserter — it
 * emits the chosen glyph via `emojiSelected` for the caller to splice into its own model
 * (there's no bound input here, so this works the same next to a plain ngModel field or a
 * FormControl either way).
 */
@Component({
  selector: 'app-emoji-picker',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './emoji-picker.html',
  styleUrl: './emoji-picker.scss',
})
export class EmojiPickerComponent {
  @Output() emojiSelected = new EventEmitter<string>();

  // A broad-enough default set for alliance/state discussions — reactions, agreement/
  // disagreement, war & diplomacy, timers. Not exhaustive (that's what the OS picker is for);
  // just enough to cover common vote question/answer flavor without a big emoji-data dependency.
  readonly emojis = [
    '👍', '👎', '✅', '❌', '🤝', '⚔️', '🛡️', '🏳️', '🏴', '🔥',
    '💪', '🚀', '⏰', '📅', '⚠️', '❗', '❓', '💬', '📢', '🗳️',
    '🎯', '🏆', '👑', '💰', '🛠️', '🧱', '🏰', '🐉', '⭐', '😀',
    '😅', '😡', '🤔', '👀', '🙌', '🙏', '💀', '🚫', '➕', '➖',
  ];

  pick(emoji: string): void {
    this.emojiSelected.emit(emoji);
  }
}
