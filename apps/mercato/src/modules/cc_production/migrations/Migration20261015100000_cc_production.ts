import { Migration } from '@mikro-orm/migrations';

export class Migration20261015100000_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_fg_direct_ins" add "vendor_id" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_fg_direct_ins" drop column "vendor_id";`);
  }

}
