<template>
  <div>
    <section class="hero">
      <div>
        <el-tag effect="plain" type="success">{{ t('salesChain') }}</el-tag>
        <h1 style="margin-top: 18px">{{ t('workspace') }}</h1>
        <p>{{ t('mvpIntro') }} 客户线索、现场勘测、报价审批、订单转项目、双专业交付、验收回款与售后工单在同一条链路上流转，每一步都有事件留痕。</p>
        <div class="toolbar-actions">
          <el-button type="primary" size="large" @click="enter">
            {{ auth.authenticated ? t('workspace') : t('login') }}
          </el-button>
          <el-button size="large" v-if="!auth.authenticated" @click="$router.push('/register')">{{ t('register') }}</el-button>
        </div>
      </div>
      <div class="hero-card">
        <h3>业务链路</h3>
        <div class="chain">
          <span>{{ t('leads') }}</span>
          <span>{{ t('surveys') }}</span>
          <span>{{ t('quotes') }}</span>
          <span>{{ t('orders') }}</span>
          <span>{{ t('projects') }}</span>
          <span>{{ t('finalAcceptance') }}</span>
          <span>{{ t('payment') }}</span>
          <span>{{ t('tickets') }}</span>
        </div>
        <hr style="border: none; border-top: 1px solid var(--solar-border); margin: 22px 0" />
        <div class="detail-grid">
          <div class="detail-item"><span>{{ t('delivery') }}</span>{{ t('electricalReview') }} + {{ t('structuralReview') }}</div>
          <div class="detail-item"><span>{{ t('finance') }}</span>{{ t('commissionDue') }} / {{ t('outstanding') }}</div>
          <div class="detail-item"><span>{{ t('identity') }}</span>{{ t('role') }} · {{ t('approvals') }}</div>
          <div class="detail-item"><span>{{ t('integrations') }}</span>Outbox / Inbox</div>
        </div>
      </div>
    </section>

    <section class="feature-grid">
      <div class="feature">
        <h4>{{ t('customers') }} · {{ t('surveys') }}</h4>
        <p>线索归属销售，勘测提交后由电气工程师审核；客户 360 汇总勘测、报价与订单。</p>
      </div>
      <div class="feature">
        <h4>{{ t('quotes') }} · {{ t('orders') }}</h4>
        <p>报价经销售经理审批、客户接受后转订单，订单自动下发到交付服务创建项目。</p>
      </div>
      <div class="feature">
        <h4>{{ t('projects') }} · {{ t('finalAcceptance') }}</h4>
        <p>电气与结构工程师共同推进，设备状态可追踪；最终验收触发提成计算。</p>
      </div>
      <div class="feature">
        <h4>{{ t('payment') }} · {{ t('ledger') }}</h4>
        <p>财务登记回款，台账自动计算未回款与应发提成，全部结清且验收后才可结算。</p>
      </div>
      <div class="feature">
        <h4>{{ t('settlements') }}</h4>
        <p>按月份生成薪酬结算单，含底薪、提成与奖惩调整，支持确认与发放。</p>
      </div>
      <div class="feature">
        <h4>{{ t('tickets') }}</h4>
        <p>验收后的售后工单可关联项目与设备，处理进度同步回销售订单。</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

function enter() {
  if (!auth.authenticated) router.push('/login');
  else router.push(auth.staff ? '/workbench' : '/cases');
}
</script>
