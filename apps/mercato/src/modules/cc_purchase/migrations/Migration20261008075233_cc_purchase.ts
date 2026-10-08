import { Migration } from '@mikro-orm/migrations';

export class Migration20261008075233_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_grns" add "vehicle_no" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_grns" drop column "vehicle_no";`);
  }

}
