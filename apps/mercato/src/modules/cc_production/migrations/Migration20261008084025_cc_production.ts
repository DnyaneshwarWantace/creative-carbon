import { Migration } from '@mikro-orm/migrations';

export class Migration20261008084025_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" add "tested_by" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" drop column "tested_by";`);
  }

}
