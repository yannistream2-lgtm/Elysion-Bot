// moderationService.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';

function getTargetLabel(target) {
  return target.user?.tag ?? target.displayName ?? 'cet utilisateur';
}

function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }) {
    if (actor === 'moderator') {
      return (
        `Vous ne pouvez pas ${action} **${targetLabel}** — son rôle **${targetRole.name}** est égal ou supérieur au vôtre (**${actorRole.name}**). ` +
        `Dans **Paramètres du serveur → Rôles**, placez votre rôle de modérateur au-dessus de **${targetRole.name}**.`
      );
    }

    return (
      `Je ne peux pas ${action} **${targetLabel}** — mon rôle **${actorRole.name}** est égal ou inférieur au sien (**${targetRole.name}**). ` +
      `Dans **Paramètres du serveur → Rôles**, placez le rôle de mon bot au-dessus de **${targetRole.name}**.`
    );
  }

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember = target.guild?.members?.me;
      const botRole = getHighestRole(botMember);
      if (!botRole || !targetRole) {
        return `La hiérarchie des rôles du bot a bloqué l'action ${action} pour ${targetLabel}`;
      }
      return `Le rôle du bot **${botRole.name}** est trop bas par rapport à **${targetRole.name}** — placez le rôle du bot plus haut`;
    }

    const modRole = getHighestRole(moderator);
    if (!modRole || !targetRole) {
      return `La hiérarchie des rôles a bloqué l'action ${action} pour ${targetLabel}`;
    }
    return `Votre rôle **${modRole.name}** est trop bas par rapport à **${targetRole.name}** — placez votre rôle plus haut`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return { valid: false, error: 'Modérateur ou cible invalide' };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error: 'Impossible de déterminer la hiérarchie des rôles. Essayez de mentionner l’utilisateur ou utilisez la commande slash.',
      };
    }

    if (modRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRole: modRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    if (!target) {
      return { valid: false, error: 'Cible invalide' };
    }

    const botMember = target.guild?.members?.me;
    if (!botMember) {
      return { valid: false, error: 'Le bot ne se trouve pas sur ce serveur' };
    }

    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error: 'Impossible de déterminer la hiérarchie des rôles du bot. Vérifiez que mon rôle est correctement configuré sur ce serveur.',
      };
    }

    if (botRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'bot',
          actorRole: botRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);
    if (!botCheck.valid) {
      throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
    }

    const modCheck = this.validateHierarchy(moderator, target, action);
    if (!modCheck.valid) {
      throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'Aucune raison fournie',
    deleteDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Paramètres requis manquants',
          ErrorTypes.VALIDATION,
          'Le serveur, l’utilisateur et le modérateur sont requis'
        );
      }

      let targetMember = null;
      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('La cible ne se trouve pas sur le serveur, bannissement en cours');
      }

      if (targetMember) {
        this.assertModerationHierarchy(moderator, targetMember, 'bannir');
      } else {

        const isOwner = guild.ownerId === moderator.id;
        const hasHighPerms = moderator.permissions.has([
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
            throw new TitanBotError(
                'Vous ne disposez pas des permissions nécessaires pour bannir des utilisateurs qui ne sont pas sur le serveur.',
                ErrorTypes.PERMISSION,
                'Vous devez disposer de la permission « Gérer le serveur » ou « Administrateur » pour bannir des utilisateurs qui ne sont pas actuellement sur le serveur.'
            );
        }
      }

      await guild.members.ban(user.id, { reason });

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Membre banni',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
            deleteDays
          }
        }
      });

      logger.info(`Utilisateur banni : ${user.tag} par ${moderator.user.tag} sur ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Erreur lors du bannissement de l’utilisateur :', error);
      throw error;
    }
  }

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'Aucune raison fournie'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Paramètres requis manquants',
          ErrorTypes.VALIDATION,
          'Le serveur, le membre et le modérateur sont requis'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'expulser');

      if (!member.kickable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Impossible d’expulser le membre',
          ErrorTypes.PERMISSION,
          `Je ne peux pas expulser **${targetLabel}**. Il possède peut-être la permission **Administrateur** ou un rôle géré/intégré. ` +
          'Assurez-vous que le rôle de mon bot est au-dessus du sien dans **Paramètres du serveur → Rôles** et qu’il ne possède pas la permission Administrateur.'
        );
      }

      await member.kick(reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Membre expulsé',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`Utilisateur expulsé : ${member.user.tag} par ${moderator.user.tag} sur ${guild.name}`);
      
      return {
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error('Erreur lors de l’expulsion de l’utilisateur :', error);
      throw error;
    }
  }

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'Aucune raison fournie'
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new TitanBotError(
          'Paramètres requis manquants',
          ErrorTypes.VALIDATION,
          'Le serveur, le membre, le modérateur et la durée sont requis'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'mettre en timeout');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Impossible de mettre le membre en timeout',
          ErrorTypes.PERMISSION,
          `Je ne peux pas mettre **${targetLabel}** en timeout. Il possède peut-être la permission **Administrateur** ou un rôle géré/intégré. ` +
          'Assurez-vous que le rôle de mon bot est au-dessus du sien dans **Paramètres du serveur → Rôles** et qu’il ne possède pas la permission Administrateur.'
        );
      }

      await member.timeout(durationMs, reason);

      const durationMinutes = Math.floor(durationMs / 60000);
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Membre mis en timeout',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} minutes`,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(`Utilisateur mis en timeout : ${member.user.tag} par ${moderator.user.tag} sur ${guild.name}`);
      
      return {
        caseId,
        user: member.user.tag,
        duration: durationMinutes,
        reason
      };
    } catch (error) {
      logger.error('Erreur lors de la mise en timeout de l’utilisateur :', error);
      throw error;
    }
  }

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Timeout retiré par un modérateur'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Paramètres requis manquants',
          ErrorTypes.VALIDATION,
          'Le serveur, le membre et le modérateur sont requis'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'retirer le timeout de');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Impossible de modifier le membre',
          ErrorTypes.PERMISSION,
          `Je ne peux pas modifier **${targetLabel}**. Il possède peut-être la permission **Administrateur** ou un rôle géré/intégré. ` +
          'Assurez-vous que le rôle de mon bot est au-dessus du sien dans **Paramètres du serveur → Rôles**.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        throw new TitanBotError(
          'Utilisateur non timeout',
          ErrorTypes.VALIDATION,
          `${member.user.tag} n’est actuellement pas en timeout`
        );
      }

      await member.timeout(null, reason);

      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Timeout retiré au membre',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`Timeout retiré : ${member.user.tag} par ${moderator.user.tag} sur ${guild.name}`);
      
      return {
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Erreur lors du retrait du timeout :', error);
      throw error;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'Aucune raison fournie'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Paramètres requis manquants',
          ErrorTypes.VALIDATION,
          'Le serveur, l’utilisateur et le modérateur sont requis'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'Utilisateur non banni',
          ErrorTypes.VALIDATION,
          `${user.tag} n’est actuellement pas banni de ce serveur`
        );
      }

      await guild.members.unban(user.id, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Membre débanni',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`Utilisateur débanni : ${user.tag} par ${moderator.user.tag} sur ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Erreur lors du débannissement de l’utilisateur :', error);
      throw error;
    }
  }
}
