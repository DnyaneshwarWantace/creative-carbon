import { Migration } from '@mikro-orm/migrations';

export class Migration20261014160000_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_grns" add "supplier_tc_no" text null, add "supplier_tc_waived_reason" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_grns" drop column "supplier_tc_no", drop column "supplier_tc_waived_reason";`);
  }

}
