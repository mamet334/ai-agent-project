/**
 * SemanticContextService - Layer 2 Capability Service
 * Bertanggung jawab atas pemahaman semantik dan konteks percakapan.
 * Mengelola graph entity untuk memahami relasi antar informasi user.
 */

import { IntentParser } from './IntentParser.js';
import { EntityExtractor } from './EntityExtractor.js';

export class SemanticContextService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.intentParser = new IntentParser();
    this.entityExtractor = new EntityExtractor();
    this.semanticGraph = new Map(); // userId -> { entities: [], relations: [] }
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    // Inisialisasi semantic graph kosong
    this.semanticGraph.clear();

    this.isInitialized = true;
    this.eventBus.emit('SemanticContext:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[SemanticContextService] Initialized');
  }

  /**
   * Parse intent dari pesan user
   * @param {string} userMessage - Pesan dari user
   * @returns {Object} { intent, confidence, entities }
   */
  parseIntent(userMessage) {
    const intentResult = this.intentParser.parse(userMessage);
    const entities = this.entityExtractor.extract(userMessage);
    
    return {
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      entities
    };
  }

  /**
   * Ekstrak entity dari pesan user
   * @param {string} userMessage - Pesan dari user
   * @param {string} intent - Intent yang sudah terdeteksi
   * @returns {Object} entities
   */
  extractEntities(userMessage, intent) {
    return this.entityExtractor.extract(userMessage);
  }

  /**
   * Update semantic graph dengan entity baru
   * @param {string} userId - ID user
   * @param {Object} entities - Entity yang diekstrak
   */
  updateGraph(userId, entities) {
    if (!this.semanticGraph.has(userId)) {
      this.semanticGraph.set(userId, { entities: [], relations: [] });
    }

    const userGraph = this.semanticGraph.get(userId);

    // Tambah entity baru jika belum ada
    for (const entity of entities) {
      const existingIndex = userGraph.entities.findIndex(e => e.type === entity.type && e.value === entity.value);
      if (existingIndex === -1) {
        userGraph.entities.push(entity);
      } else {
        // Update confidence jika entity sudah ada
        userGraph.entities[existingIndex].confidence = Math.max(userGraph.entities[existingIndex].confidence, entity.confidence);
      }
    }

    // Hubungkan entity yang berelasi (sederhana: entity dengan tipe yang sama dianggap berelasi)
    this._buildRelations(userGraph);

    this.semanticGraph.set(userId, userGraph);
    this.eventBus.emit('SemanticContext:GraphUpdated', { userId, graph: userGraph });
    console.log('[SemanticContextService] Graph updated for user:', userId);
  }

  /**
   * Bangun relasi antar entity
   * @private
   */
  _buildRelations(userGraph) {
    userGraph.relations = [];
    
    // Relasi sederhana: entity dengan tipe yang sama dianggap berelasi
    for (let i = 0; i < userGraph.entities.length; i++) {
      for (let j = i + 1; j < userGraph.entities.length; j++) {
        const entityA = userGraph.entities[i];
        const entityB = userGraph.entities[j];
        
        // Jika tipe sama, buat relasi
        if (entityA.type === entityB.type) {
          userGraph.relations.push({
            from: entityA.value,
            to: entityB.value,
            type: 'SAME_TYPE',
            confidence: 0.5
          });
        }
      }
    }
  }

  /**
   * Dapatkan konteks terstruktur untuk query
   * @param {string} userId - ID user
   * @param {string} query - Query user
   * @returns {Object} Konteks terstruktur
   */
  getContext(userId, query) {
    if (!this.semanticGraph.has(userId)) {
      return { entities: [], relations: [], context: '' };
    }

    const userGraph = this.semanticGraph.get(userId);
    const queryLower = query.toLowerCase();

    // Filter entity yang relevan dengan query
    const relevantEntities = userGraph.entities.filter(entity => 
      entity.value.toLowerCase().includes(queryLower) || 
      queryLower.includes(entity.value.toLowerCase())
    );

    // Filter relasi yang relevan
    const relevantRelations = userGraph.relations.filter(relation => 
      relevantEntities.some(e => e.value === relation.from || e.value === relation.to)
    );

    // Bangun konteks string untuk LLM
    const contextParts = [];
    if (relevantEntities.length > 0) {
      contextParts.push('Entity yang relevan:');
      relevantEntities.forEach(entity => {
        contextParts.push(`- ${entity.type}: ${entity.value} (confidence: ${entity.confidence})`);
      });
    }

    if (relevantRelations.length > 0) {
      contextParts.push('\nRelasi yang relevan:');
      relevantRelations.forEach(relation => {
        contextParts.push(`- ${relation.from} -> ${relation.to} (${relation.type})`);
      });
    }

    return {
      entities: relevantEntities,
      relations: relevantRelations,
      context: contextParts.join('\n')
    };
  }

  /**
   * Dapatkan seluruh graph untuk user
   * @param {string} userId - ID user
   * @returns {Object} Graph user
   */
  getGraph(userId) {
    return this.semanticGraph.get(userId) || { entities: [], relations: [] };
  }

  /**
   * Hapus graph untuk user
   * @param {string} userId - ID user
   */
  clearGraph(userId) {
    this.semanticGraph.delete(userId);
    this.eventBus.emit('SemanticContext:GraphCleared', { userId });
    console.log('[SemanticContextService] Graph cleared for user:', userId);
  }
}
