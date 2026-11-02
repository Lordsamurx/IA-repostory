export type ID = string;

export type Role = 'admin' | 'supervisor' | 'atendente';
export type Presence = 'online' | 'ausente' | 'offline';

export interface User {
  id: ID;
  name: string;
  email: string;
  role: Role;
  presence: Presence;
  departmentIds: ID[];
  color: string;
  /** Somente no modo local: hash PBKDF2 da senha (ver lib/password.ts). No modo Supabase a senha fica no Auth. */
  passwordHash?: string;
  /** Legado (versões antigas do modo local, texto puro). Migrado para passwordHash no primeiro login. */
  password?: string;
}

export interface Department {
  id: ID;
  name: string;
  color: string;
}

export interface Tag {
  id: ID;
  name: string;
  color: string;
}

export const LEAD_SOURCES = ['WhatsApp', 'Meta Ads', 'Instagram', 'Site', 'Indicação', 'Google'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Contact {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  city?: string;
  source: LeadSource;
  tagIds: ID[];
  ownerId?: ID;
  notes?: string;
  createdAt: string;
  color: string;
  /** Valores dos campos personalizados, por id do campo */
  customFields?: Record<ID, string>;
}

export type ConversationStatus = 'aguardando' | 'em_atendimento' | 'finalizado';

export interface FollowUpState {
  followUpId: ID;
  /** Índice do próximo passo a enviar */
  nextStep: number;
}

export interface Conversation {
  id: ID;
  contactId: ID;
  connectionId: ID;
  status: ConversationStatus;
  assigneeId?: ID;
  departmentId?: ID;
  aiEnabled: boolean;
  agentId?: ID;
  unread: number;
  pinned: boolean;
  lastMessageAt: string;
  /** Contador de respostas da IA desde a última intervenção humana */
  aiReplies: number;
  followUp?: FollowUpState;
  /** Chatbot aguardando o cliente escolher uma opção do menu */
  bot?: { flowId: ID; attempts: number };
  /** Disparo que originou a última mensagem enviada (para medir respostas) */
  broadcastId?: ID;
  /** Usuários que marcaram a conversa como favorita */
  favoriteBy?: ID[];
  /** Chatbot desligado nesta conversa (ex.: grupos, clientes VIP) */
  botDisabled?: boolean;
  /** Pesquisa NPS enviada e aguardando a nota */
  npsPending?: boolean;
}

export type MessageKind = 'text' | 'note' | 'image' | 'audio' | 'document' | 'system';
export type MessageAuthor = 'contact' | 'ai' | 'bot' | 'broadcast' | 'system' | 'followup' | 'nps' | ID;

/** Autores automáticos (não são pessoas da equipe) */
export const AUTOMATED_AUTHORS = ['ai', 'bot', 'broadcast', 'system', 'followup', 'nps'] as const;

export interface Message {
  id: ID;
  conversationId: ID;
  direction: 'in' | 'out';
  kind: MessageKind;
  body: string;
  author: MessageAuthor;
  createdAt: string;
  status: 'sent' | 'delivered' | 'read';
  fileName?: string;
  /** Mensagem citada (responder) */
  replyTo?: ID;
  forwarded?: boolean;
  /** Usuários mencionados com @ numa nota interna */
  mentions?: ID[];
  /** Conteúdo do arquivo (data URL) quando enviado da biblioteca */
  fileData?: string;
  /** ID da mensagem no WhatsApp (gateway). Evita duplicar recebimentos e reenvios. */
  externalId?: string;
  /** Entrega pelo WhatsApp real (só em conexões ligadas a um gateway). */
  delivery?: 'sent' | 'failed';
  /** Motivo da falha de envio, mostrado ao atendente. */
  deliveryError?: string;
  /** Template aprovado pela Meta (API oficial): obrigatório com a janela de 24 h fechada. */
  templateName?: string;
  templateLang?: string;
}

export interface Stage {
  id: ID;
  name: string;
  color: string;
  probability: number;
}

export interface Pipeline {
  id: ID;
  name: string;
  stages: Stage[];
  /** Restrição de visualização. Vazio = toda a equipe. Admins sempre veem. */
  visibility?: { userIds: ID[]; departmentIds: ID[]; onlyOwn: boolean };
}

export type DealStatus = 'aberto' | 'ganho' | 'perdido';

export interface Deal {
  id: ID;
  pipelineId: ID;
  stageId: ID;
  contactId: ID;
  title: string;
  value: number;
  ownerId?: ID;
  productIds: ID[];
  status: DealStatus;
  lostReason?: string;
  expectedClose?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskType = 'ligacao' | 'whatsapp' | 'reuniao' | 'email' | 'outro';
export type Priority = 'baixa' | 'media' | 'alta';

export interface Task {
  id: ID;
  title: string;
  description?: string;
  type: TaskType;
  priority: Priority;
  dueAt: string;
  done: boolean;
  contactId?: ID;
  dealId?: ID;
  assigneeId?: ID;
  createdAt: string;
}

export interface Product {
  id: ID;
  name: string;
  sku: string;
  category: string;
  price: number;
  description: string;
  active: boolean;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Agent {
  id: ID;
  name: string;
  objective: string;
  tone: 'amigavel' | 'profissional' | 'descontraido' | 'objetivo';
  prompt: string;
  greeting: string;
  model: string;
  temperature: number;
  active: boolean;
  knowledgeIds: ID[];
  connectionIds: ID[];
  qualification: string[];
  maxDiscount: number;
  schedule: { enabled: boolean; start: string; end: string; days: Weekday[] };
  handoff: {
    keywords: string[];
    maxReplies: number;
    departmentId?: ID;
    message: string;
  };
  createdAt: string;
}

export type KnowledgeType = 'faq' | 'texto' | 'url' | 'documento';

export interface KnowledgeItem {
  id: ID;
  type: KnowledgeType;
  title: string;
  content: string;
  updatedAt: string;
}

export interface FollowUpStep {
  id: ID;
  delayMinutes: number;
  message: string;
}

export interface FollowUp {
  id: ID;
  name: string;
  active: boolean;
  /** Dispara quando o lead fica sem responder após a última mensagem enviada */
  trigger: 'sem_resposta';
  steps: FollowUpStep[];
  stopOnReply: boolean;
  sent: number;
  replied: number;
  createdAt: string;
}

export type ConnectionType = 'qrcode' | 'api_oficial' | 'parceiro';
export type ConnectionStatus = 'conectado' | 'desconectado' | 'aguardando_qr';

export interface Connection {
  id: ID;
  name: string;
  phone: string;
  type: ConnectionType;
  status: ConnectionStatus;
  departmentId?: ID;
  color: string;
  createdAt: string;
  /** Quem pode iniciar conversas por este número. Vazio = toda a equipe. */
  allowedUserIds?: ID[];
  /** Nome da instância no gateway (Evolution API). Presente = conexão real, não simulada. */
  instance?: string;
}

export interface QuickReply {
  id: ID;
  shortcut: string;
  content: string;
}

export interface Campaign {
  id: ID;
  name: string;
  status: 'ativa' | 'pausada';
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  companyName: string;
  businessType: string;
  timezone: string;
  brandColor: string;
  logoText: string;
  onboarded: boolean;
  businessHours: { start: string; end: string; days: Weekday[] };
  outOfHoursMessage: string;
  autoAssign: boolean;
  nps: { enabled: boolean; autoOnFinish: boolean; question: string; thanks: string };
  aiProvider: 'anthropic' | 'openai';
  theme?: ThemeMode;
}

export interface Notification {
  id: ID;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: string;
  /** Destinatário. Sem valor = toda a equipe. */
  userId?: ID;
}

export type CustomFieldType = 'texto' | 'texto_longo' | 'email' | 'numero' | 'data' | 'hora' | 'lista';

export interface CustomField {
  id: ID;
  name: string;
  type: CustomFieldType;
  options: string[];
}

export interface ScheduledMessage {
  id: ID;
  conversationId: ID;
  body: string;
  sendAt: string;
  status: 'pendente' | 'enviada' | 'cancelada';
  createdBy?: ID;
  createdAt: string;
}

export type BroadcastStatus = 'rascunho' | 'agendado' | 'enviando' | 'pausado' | 'concluido';

export interface Broadcast {
  id: ID;
  name: string;
  connectionId: ID;
  message: string;
  audience: { tagIds: ID[]; sources: LeadSource[]; stageIds: ID[] };
  recipients: ID[];
  scheduledAt?: string;
  intervalSec: number;
  status: BroadcastStatus;
  sent: number;
  replied: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Nome do template HSM (obrigatório na API Oficial fora da janela de 24h) */
  templateName?: string;
  templateLang?: string;
}

export type BotActionType = 'nenhuma' | 'transferir' | 'etiqueta' | 'funil' | 'ia' | 'finalizar';

export interface BotOption {
  id: ID;
  key: string;
  label: string;
  reply: string;
  action: BotActionType;
  /** departamento, etiqueta, etapa do funil ou agente, conforme a ação */
  value?: ID;
}

export interface ChatbotFlow {
  id: ID;
  name: string;
  active: boolean;
  connectionIds: ID[];
  trigger: 'primeira_mensagem' | 'palavra_chave';
  keywords: string[];
  greeting: string;
  options: BotOption[];
  invalidMessage: string;
  runs: number;
  createdAt: string;
}

export interface FileAsset {
  id: ID;
  name: string;
  folder: string;
  mime: string;
  size: number;
  /** Conteúdo em data URL (limitado em tamanho) */
  data: string;
  createdBy?: ID;
  createdAt: string;
}

export interface NpsResponse {
  id: ID;
  conversationId: ID;
  contactId: ID;
  /** Atendente responsável no momento da pesquisa */
  userId?: ID;
  score: number;
  comment?: string;
  createdAt: string;
}
