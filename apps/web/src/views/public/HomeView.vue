<template>
  <div>
    <section class="hero">
      <div>
        <el-tag effect="plain" type="success">{{ t('salesChain') }}</el-tag>
        <h1 style="margin-top: 18px">{{ t('workspace') }}</h1>
        <p>{{ t('mvpIntro') }} {{ t('heroDescription') }}</p>
        <div class="toolbar-actions">
          <el-button type="primary" size="large" @click="enter">
            {{ auth.authenticated ? t('workspace') : t('login') }}
          </el-button>
          <el-button size="large" v-if="!auth.authenticated" @click="$router.push('/register')">{{ t('register') }}</el-button>
        </div>
      </div>
      <div class="hero-card">
        <h3>{{ t('businessChain') }}</h3>
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
        <p>{{ t('featureCustomerSurveys') }}</p>
      </div>
      <div class="feature">
        <h4>{{ t('quotes') }} · {{ t('orders') }}</h4>
        <p>{{ t('featureQuotesOrders') }}</p>
      </div>
      <div class="feature">
        <h4>{{ t('projects') }} · {{ t('finalAcceptance') }}</h4>
        <p>{{ t('featureProjectsAcceptance') }}</p>
      </div>
      <div class="feature">
        <h4>{{ t('payment') }} · {{ t('ledger') }}</h4>
        <p>{{ t('featurePaymentLedger') }}</p>
      </div>
      <div class="feature">
        <h4>{{ t('settlements') }}</h4>
        <p>{{ t('featureSettlements') }}</p>
      </div>
      <div class="feature">
        <h4>{{ t('tickets') }}</h4>
        <p>{{ t('featureTickets') }}</p>
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
