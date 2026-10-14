import { Migration } from '@mikro-orm/migrations';

export class Migration20261014131000_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_pos" add "print_terms" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_pos" drop column "print_terms";`);
  }

}
