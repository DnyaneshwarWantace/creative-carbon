import { Migration } from '@mikro-orm/migrations';

export class Migration20261008083151_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" add "order_id" uuid null, add "order_no" text null, add "report_no" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" drop column "order_id", drop column "order_no", drop column "report_no";`);
  }

}
