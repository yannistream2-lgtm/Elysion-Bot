// economyService.js

import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../utils/serviceErrorBoundary.js';

class EconomyService {

  // Temps de recharge
  static DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
  static WORK_COOLDOWN = 30 * 60 * 1000;
  static GAMBLE_COOLDOWN = 5 * 60 * 1000;
  static CRIME_COOLDOWN = 60 * 60 * 1000;
  static ROB_COOLDOWN = 4 * 60 * 60 * 1000;
  static MINE_COOLDOWN = 60 * 60 * 1000;
  static FISH_COOLDOWN = 45 * 60 * 1000;
  static BEG_COOLDOWN = 30 * 60 * 1000;

  // Montant de la récompense quotidienne
  static DAILY_AMOUNT = 1000;

  static MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

  static assertSafeBalance(value, context = {}) {
    if (!Number.isSafeInteger(value) || value < 0 || value > this.MAX_SAFE_INTEGER) {
      throw createError(
        "Solde invalide",
        ErrorTypes.VALIDATION,
        "Cette opération créerait un solde de compte invalide.",
        { value, ...context }
      );
    }
  }

  // Réclamer la récompense quotidienne
  static async claimDaily(client, guildId, userId) {
    logger.debug(`[ECONOMIE_SERVICE] Récompense quotidienne demandée`, {
      userId,
      guildId
    });

    const userData = await getEconomyData(client, guildId, userId);

    if (!userData) {
      logger.error(`[ECONOMIE_SERVICE] Impossible de charger les données économiques pour la récompense quotidienne`);

      throw createError(
        "Impossible de charger les données économiques",
        ErrorTypes.DATABASE,
        "Impossible de charger vos données économiques. Veuillez réessayer plus tard.",
        { userId, guildId }
      );
    }

    const now = Date.now();
    const lastDaily = userData.lastDaily || 0;
    const remaining = lastDaily + this.DAILY_COOLDOWN - now;

    if (remaining > 0) {
      logger.warn(`[ECONOMIE_SERVICE] Temps de recharge quotidien actif`, {
        userId,
        timeRemaining: remaining
      });

      throw createError(
        "Temps de recharge quotidien actif",
        ErrorTypes.RATE_LIMIT,
        `Vous devez patienter avant de réclamer votre récompense quotidienne. Réessayez dans **${this.formatDuration(remaining)}**.`,
        { remaining, cooldownType: 'daily' }
      );
    }

    const earned = this.DAILY_AMOUNT;
    const nextWallet = (userData.wallet || 0) + earned;

    this.assertSafeBalance(nextWallet, {
      operation: 'claimDaily',
      userId,
      guildId
    });

    userData.wallet = nextWallet;
    userData.lastDaily = now;

    try {
      await setEconomyData(client, guildId, userId, userData);

      logger.info(`[TRANSACTION_ECONOMIE] Récompense quotidienne réclamée`, {
        userId,
        guildId,
        amount: earned,
        newWallet: userData.wallet,
        timestamp: new Date().toISOString(),
        source: 'claim_daily'
      });

      return {
        earned,
        newWallet: userData.wallet,
        nextClaimTime: new Date(now + this.DAILY_COOLDOWN)
      };

    } catch (error) {
      logger.error(
        `[ECONOMIE_SERVICE] Impossible d'enregistrer la récompense quotidienne`,
        error,
        {
          userId,
          guildId,
          amount: earned
        }
      );

      throw createError(
        "Impossible d'enregistrer la récompense quotidienne",
        ErrorTypes.DATABASE,
        "Impossible de récupérer votre récompense quotidienne. Veuillez réessayer.",
        { userId, guildId }
      );
    }
  }

  // Transférer de l'argent à un autre utilisateur
  static async transferMoney(client, guildId, senderId, receiverId, amount) {
    logger.debug(`[ECONOMIE_SERVICE] Transfert d'argent demandé`, {
      senderId,
      receiverId,
      amount,
      guildId
    });

    if (amount <= 0) {
      throw createError(
        "Montant de transfert invalide",
        ErrorTypes.VALIDATION,
        "Le montant doit être supérieur à zéro.",
        { amount, senderId }
      );
    }

    if (senderId === receiverId) {
      throw createError(
        "Transfert vers soi-même impossible",
        ErrorTypes.VALIDATION,
        "Vous ne pouvez pas vous envoyer de l'argent à vous-même.",
        { senderId, receiverId }
      );
    }

    this.validateAmount(amount, {
      operation: 'transfer',
      senderId,
      receiverId
    });

    const [senderData, receiverData] = await Promise.all([
      getEconomyData(client, guildId, senderId),
      getEconomyData(client, guildId, receiverId)
    ]);

    if (!senderData || !receiverData) {
      logger.error(
        `[ECONOMIE_SERVICE] Impossible de charger les données économiques pour le transfert`,
        {
          senderLoaded: !!senderData,
          receiverLoaded: !!receiverData
        }
      );

      throw createError(
        "Impossible de charger les données économiques",
        ErrorTypes.DATABASE,
        "Impossible de charger les données économiques. Veuillez réessayer plus tard.",
        { senderId, receiverId, guildId }
      );
    }

    if (senderData.wallet < amount) {
      logger.warn(`[ECONOMIE_SERVICE] Solde insuffisant pour le transfert`, {
        senderId,
        required: amount,
        available: senderData.wallet
      });

      throw createError(
        "Solde insuffisant",
        ErrorTypes.VALIDATION,
        `Vous n'avez que **$${senderData.wallet.toLocaleString()}** en liquide.`,
        {
          required: amount,
          available: senderData.wallet,
          senderId
        }
      );
    }

    const walletBefore = senderData.wallet;
    const senderNext = (senderData.wallet || 0) - amount;
    const receiverNext = (receiverData.wallet || 0) + amount;

    this.assertSafeBalance(senderNext, {
      operation: 'transfer.sender',
      senderId,
      amount
    });

    this.assertSafeBalance(receiverNext, {
      operation: 'transfer.receiver',
      receiverId,
      amount
    });

    senderData.wallet = senderNext;
    receiverData.wallet = receiverNext;

    try {
      await setEconomyData(client, guildId, senderId, senderData);

      try {
        await setEconomyData(client, guildId, receiverId, receiverData);

      } catch (receiverError) {

        logger.error(
          `[ECONOMIE_CRITIQUE] Impossible de créditer le destinataire ${receiverId}. Tentative d'annulation du transfert pour ${senderId}...`,
          receiverError
        );

        senderData.wallet = walletBefore;

        try {
          await setEconomyData(client, guildId, senderId, senderData);

          logger.info(
            `[ECONOMIE_ROLLBACK] Annulation du transfert réussie pour ${senderId} après l'échec du crédit du destinataire.`
          );

        } catch (rollbackError) {
          logger.error(
            `[ECONOMIE_FATAL] ÉCHEC DE L'ANNULATION pour ${senderId} ! Les données sont maintenant incohérentes.`,
            rollbackError
          );
        }

        throw receiverError;
      }

      logger.info(`[TRANSACTION_ECONOMIE] Argent transféré`, {
        type: 'transfer',
        senderId,
        receiverId,
        guildId,
        amount,
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet,
        timestamp: new Date().toISOString()
      });

      return {
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet
      };

    } catch (error) {
      logger.error(
        `[ECONOMIE_SERVICE] Échec de l'exécution du transfert, LES DONNÉES PEUVENT ÊTRE INCOHÉRENTES`,
        error,
        {
          senderId,
          receiverId,
          amount,
          guildId,
          senderBefore: walletBefore,
          senderAfter: senderData.wallet,
          receiverAfter: receiverData.wallet
        }
      );

      throw createError(
        "Impossible d'enregistrer le transfert",
        ErrorTypes.DATABASE,
        "Impossible d'effectuer le transfert. Veuillez réessayer.",
        { senderId, receiverId, amount }
      );
    }
  }

  // Ajouter de l'argent à un utilisateur
  static async addMoney(client, guildId, userId, amount, source = 'unknown') {
    if (amount <= 0) {
      throw createError(
        "Montant invalide",
        ErrorTypes.VALIDATION,
        "Le montant doit être positif.",
        { amount, userId, source }
      );
    }

    this.validateAmount(amount, {
      operation: 'addMoney',
      userId,
      source
    });

    const userData = await getEconomyData(client, guildId, userId);

    const balanceBefore = userData.wallet || 0;
    const nextWallet = balanceBefore + amount;

    this.assertSafeBalance(nextWallet, {
      operation: 'addMoney',
      userId,
      source,
      amount
    });

    userData.wallet = nextWallet;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[TRANSACTION_ECONOMIE] Argent ajouté`, {
      userId,
      guildId,
      amount,
      source,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  // Retirer de l'argent à un utilisateur
  static async removeMoney(client, guildId, userId, amount, reason = 'unknown') {
    if (amount <= 0) {
      throw createError(
        "Montant invalide",
        ErrorTypes.VALIDATION,
        "Le montant doit être positif.",
        { amount, userId, reason }
      );
    }

    this.validateAmount(amount, {
      operation: 'removeMoney',
      userId,
      reason
    });

    const userData = await getEconomyData(client, guildId, userId);

    const balanceBefore = userData.wallet || 0;

    if (balanceBefore < amount) {
      throw createError(
        "Solde insuffisant",
        ErrorTypes.VALIDATION,
        `Vous n'avez que **$${balanceBefore.toLocaleString()}**.`,
        {
          required: amount,
          available: balanceBefore,
          reason
        }
      );
    }

    userData.wallet = balanceBefore - amount;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[TRANSACTION_ECONOMIE] Argent retiré`, {
      userId,
      guildId,
      amount,
      reason,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: -amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  // Déposer de l'argent à la banque
  static async depositToBank(client, guildId, userId, amount) {
    this.validateAmount(amount, {
      operation: 'deposit',
      userId
    });

    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);

    if (userData.wallet < amount) {
      throw createError(
        "Argent liquide insuffisant",
        ErrorTypes.VALIDATION,
        `Vous n'avez que **$${userData.wallet.toLocaleString()}** en liquide.`,
        {
          required: amount,
          available: userData.wallet
        }
      );
    }

    const currentBank = userData.bank || 0;

    if (currentBank + amount > maxBank) {
      throw createError(
        "Capacité bancaire dépassée",
        ErrorTypes.VALIDATION,
        `Votre banque ne peut contenir que **$${maxBank.toLocaleString()}**. Vous dépasseriez la capacité de **$${(currentBank + amount - maxBank).toLocaleString()}**.`,
        {
          capacity: maxBank,
          current: currentBank,
          requested: amount
        }
      );
    }

    const nextWallet = userData.wallet - amount;
    const nextBank = (userData.bank || 0) + amount;

    this.assertSafeBalance(nextWallet, {
      operation: 'deposit.wallet',
      userId,
      amount
    });

    this.assertSafeBalance(nextBank, {
      operation: 'deposit.bank',
      userId,
      amount
    });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[TRANSACTION_ECONOMIE] Argent déposé en banque`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  // Retirer de l'argent de la banque
  static async withdrawFromBank(client, guildId, userId, amount) {
    this.validateAmount(amount, {
      operation: 'withdraw',
      userId
    });

    const userData = await getEconomyData(client, guildId, userId);
    const bank = userData.bank || 0;

    if (bank < amount) {
      throw createError(
        "Solde bancaire insuffisant",
        ErrorTypes.VALIDATION,
        `Vous n'avez que **$${bank.toLocaleString()}** en banque.`,
        {
          required: amount,
          available: bank
        }
      );
    }

    const nextWallet = (userData.wallet || 0) + amount;
    const nextBank = bank - amount;

    this.assertSafeBalance(nextWallet, {
      operation: 'withdraw.wallet',
      userId,
      amount
    });

    this.assertSafeBalance(nextBank, {
      operation: 'withdraw.bank',
      userId,
      amount
    });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[TRANSACTION_ECONOMIE] Argent retiré de la banque`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  // Vérifier le temps de recharge d'une action
  static checkCooldown(userData, action, cooldownMs) {
    const lastActionField = `last${action.charAt(0).toUpperCase() + action.slice(1)}`;
    const lastTime = userData[lastActionField] || 0;
    const now = Date.now();

    const remaining = Math.max(
      0,
      lastTime + cooldownMs - now
    );

    return {
      isOnCooldown: remaining > 0,
      remaining,
      formatted: this.formatDuration(remaining),
      nextAvailable: new Date(lastTime + cooldownMs)
    };
  }

  // Valider un montant
  static validateAmount(amount, context = {}) {
    if (!Number.isInteger(amount)) {
      throw createError(
        "Montant invalide - ce n'est pas un nombre entier",
        ErrorTypes.VALIDATION,
        "Le montant doit être un nombre entier.",
        context
      );
    }

    if (amount <= 0) {
      throw createError(
        "Montant invalide - le montant n'est pas positif",
        ErrorTypes.VALIDATION,
        "Le montant doit être positif.",
        context
      );
    }

    if (amount > this.MAX_SAFE_INTEGER) {
      logger.error(
        `[ECONOMIE] Le montant dépasse MAX_SAFE_INTEGER`,
        {
          amount,
          context
        }
      );

      throw createError(
        "Montant trop élevé",
        ErrorTypes.VALIDATION,
        "Le montant est trop élevé pour être traité.",
        context
      );
    }
  }

  // Formater une durée
  static formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}min ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}min ${seconds}s`;
    }

    return `${seconds}s`;
  }

  // Formater l'affichage du temps de recharge
  static formatCooldownDisplay(ms) {
    const duration = this.formatDuration(ms);
    return `**${duration}**`;
  }
}

// Gestion centralisée des erreurs du service économique
wrapServiceClassMethods(EconomyService, (methodName) => ({
  service: 'EconomyService',
  operation: methodName,
  message: `L'opération du service économique a échoué : ${methodName}`,
  userMessage: 'Une opération économique a échoué. Veuillez réessayer dans quelques instants.'
}));

export default EconomyService;
