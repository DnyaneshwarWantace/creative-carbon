import { Migration } from '@mikro-orm/migrations';

export class Migration20261014121134_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_pos" add "print_details" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_pos" drop column "print_details";`);
  }

}
