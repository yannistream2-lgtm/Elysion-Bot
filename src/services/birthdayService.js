// birthdayService.js

import { getGuildConfig } from './config/guildConfig.js';
import {
  getGuildBirthdays,
  setBirthday as dbSetBirthday,
  deleteBirthday as dbDeleteBirthday,
  getMonthName,
  getBirthdayTrackingKey
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';

export function validateBirthday(month, day) {

  if (typeof month !== 'number' || typeof day !== 'number') {
    return {
      isValid: false,
      error: 'Le mois et le jour doivent être des nombres'
    };
  }

  if (month < 1 || month > 12) {
    return {
      isValid: false,
      error: 'Le mois doit être compris entre 1 et 12'
    };
  }

  if (day < 1 || day > 31) {
    return {
      isValid: false,
      error: 'Le jour doit être compris entre 1 et 31'
    };
  }

  const currentYear = new Date().getFullYear();
  const date = new Date(currentYear, month - 1, day);

  if (
    isNaN(date.getTime()) ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return {
      isValid: false,
      error: 'Date invalide. Vérifiez la combinaison du mois et du jour (par exemple, le 29 février existe uniquement les années bissextiles)'
    };
  }

  return { isValid: true };
}

export async function setBirthday(client, guildId, userId, month, day) {
  try {

    const validation = validateBirthday(month, day);

    if (!validation.isValid) {
      logger.warn('Échec de la validation de la date d’anniversaire', {
        userId,
        guildId,
        month,
        day,
        error: validation.error
      });

      throw new TitanBotError(
        validation.error,
        ErrorTypes.VALIDATION,
        validation.error,
        { month, day, userId, guildId }
      );
    }

    const success = await dbSetBirthday(
      client,
      guildId,
      userId,
      month,
      day
    );

    if (!success) {
      throw new TitanBotError(
        'Échec de l’enregistrement de la date d’anniversaire dans la base de données',
        ErrorTypes.DATABASE,
        'Impossible d’enregistrer votre date d’anniversaire. Veuillez réessayer plus tard.',
        { userId, guildId, month, day }
      );
    }

    logger.info('Date d’anniversaire enregistrée avec succès', {
      userId,
      guildId,
      month,
      day,
      monthName: getMonthName(month)
    });

    return {
      data: {
        month,
        day,
        monthName: getMonthName(month)
      }
    };
  } catch (error) {
    logger.error('Erreur dans le service de définition de l’anniversaire', {
      error: error.message,
      stack: error.stack,
      userId,
      guildId,
      month,
      day
    });

    throw error;
  }
}

export async function getUserBirthday(client, guildId, userId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    const birthdayData = birthdays[userId];

    if (!birthdayData) {
      return null;
    }

    return {
      month: birthdayData.month,
      day: birthdayData.day,
      monthName: getMonthName(birthdayData.month)
    };
  } catch (error) {
    logger.error('Erreur dans le service de récupération de l’anniversaire', {
      error: error.message,
      userId,
      guildId
    });

    throw error;
  }
}

export async function getAllBirthdays(client, guildId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);

    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const sortedBirthdays = Object.entries(birthdays)
      .map(([userId, data]) => ({
        userId,
        month: data.month,
        day: data.day,
        monthName: getMonthName(data.month)
      }))
      .sort((a, b) => {
        if (a.month !== b.month) {
          return a.month - b.month;
        }

        return a.day - b.day;
      });

    return sortedBirthdays;
  } catch (error) {
    logger.error('Erreur dans le service de récupération de tous les anniversaires', {
      error: error.message,
      guildId
    });

    throw error;
  }
}

export async function deleteBirthday(client, guildId, userId) {
  try {

    const birthday = await getUserBirthday(
      client,
      guildId,
      userId
    );

    if (!birthday) {
      return {
        status: 'not_found'
      };
    }

    const success = await dbDeleteBirthday(
      client,
      guildId,
      userId
    );

    if (!success) {
      throw new TitanBotError(
        'Échec de la suppression de la date d’anniversaire de la base de données',
        ErrorTypes.DATABASE,
        'Impossible de supprimer votre date d’anniversaire. Veuillez réessayer.',
        { userId, guildId }
      );
    }

    logger.info('Date d’anniversaire supprimée avec succès', {
      userId,
      guildId
    });

    return {
      status: 'removed'
    };
  } catch (error) {
    logger.error('Erreur dans le service de suppression de l’anniversaire', {
      error: error.message,
      userId,
      guildId
    });

    throw error;
  }
}

export async function getUpcomingBirthdays(client, guildId, limit = 5) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);

    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const today = new Date();
    const currentYear = today.getFullYear();

    const upcomingBirthdays = [];

    for (const [userId, userData] of Object.entries(birthdays)) {
      let nextBirthday = new Date(
        currentYear,
        userData.month - 1,
        userData.day
      );

      if (nextBirthday < today) {
        nextBirthday = new Date(
          currentYear + 1,
          userData.month - 1,
          userData.day
        );
      }

      const daysUntil = Math.ceil(
        (nextBirthday - today) / (1000 * 60 * 60 * 24)
      );

      upcomingBirthdays.push({
        userId,
        month: userData.month,
        day: userData.day,
        monthName: getMonthName(userData.month),
        date: nextBirthday,
        daysUntil
      });
    }

    upcomingBirthdays.sort(
      (a, b) => a.daysUntil - b.daysUntil
    );

    return upcomingBirthdays.slice(0, limit);

  } catch (error) {
    logger.error('Erreur dans le service des anniversaires à venir', {
      error: error.message,
      guildId,
      limit
    });

    throw error;
  }
}

export async function getTodaysBirthdays(client, guildId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);

    const today = new Date();
    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();

    const todaysBirthdays = [];

    for (const [userId, userData] of Object.entries(birthdays)) {
      if (
        userData.month === currentMonth &&
        userData.day === currentDay
      ) {
        todaysBirthdays.push({
          userId,
          month: userData.month,
          day: userData.day,
          monthName: getMonthName(userData.month)
        });
      }
    }

    return todaysBirthdays;

  } catch (error) {
    logger.error('Erreur dans le service des anniversaires du jour', {
      error: error.message,
      guildId
    });

    throw error;
  }
}

export async function checkBirthdays(client) {
  const today = new Date();
  const currentMonth = today.getUTCMonth() + 1;
  const currentDay = today.getUTCDate();

  if (process.env.NODE_ENV !== 'production') {
    logger.debug(
      `🎂 Vérification quotidienne des anniversaires pour UTC : ${currentMonth}/${currentDay}.`
    );
  }

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const config = await getGuildConfig(client, guildId);
      const {
        birthdayChannelId,
        birthdayRoleId
      } = config;

      // Un salon est requis pour les annonces ; le rôle d’anniversaire est facultatif.
      if (!birthdayChannelId) {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(
            `Vérification des anniversaires ignorée pour ${guild.name} : configuration du salon manquante.`
          );
        }

        continue;
      }

      const channel = await guild.channels
        .fetch(birthdayChannelId)
        .catch(() => null);

      if (!channel) {
        continue;
      }

      const trackingKey = getBirthdayTrackingKey(guildId);

      const trackingData =
        (await client.db.get(trackingKey)) || {};

      const updatedTrackingData = {
        ...trackingData
      };

      // Supprimer les rôles d’anniversaire précédemment attribués.
      for (const userId of Object.keys(trackingData)) {
        try {
          if (birthdayRoleId) {
            const member = await guild.members
              .fetch(userId)
              .catch(() => null);

            if (
              member &&
              member.roles.cache.has(birthdayRoleId)
            ) {
              await member.roles.remove(
                birthdayRoleId,
                'Le rôle d’anniversaire a expiré'
              );
            }
          }

          delete updatedTrackingData[userId];

        } catch (error) {
          logger.error(
            `Erreur lors de la suppression du rôle d’anniversaire de ${userId} :`,
            error
          );
        }
      }

      if (
        Object.keys(updatedTrackingData).length !==
        Object.keys(trackingData).length
      ) {
        await client.db.set(
          trackingKey,
          updatedTrackingData
        );
      }

      // Utiliser le stockage officiel des anniversaires
      // utilisé par les commandes de définition et de suppression.
      const birthdays =
        (await getGuildBirthdays(client, guildId)) || {};

      const birthdayMembers = [];

      for (
        const [userId, userData] of Object.entries(birthdays)
      ) {
        if (
          userData.month === currentMonth &&
          userData.day === currentDay
        ) {
          const member = await guild.members
            .fetch(userId)
            .catch(() => null);

          if (member) {
            birthdayMembers.push(member);

            if (birthdayRoleId) {
              try {
                await member.roles.add(
                  birthdayRoleId,
                  'Joyeux anniversaire ! 🎉'
                );

                updatedTrackingData[userId] = true;

              } catch (error) {
                logger.error(
                  `Erreur lors de l’ajout du rôle d’anniversaire à ${member.user.tag} :`,
                  error
                );
              }
            }
          }
        }
      }

      if (birthdayMembers.length > 0) {
        await client.db.set(
          trackingKey,
          updatedTrackingData
        );

        const mentionList = birthdayMembers
          .map(member => member.toString())
          .join(', ');

        await channel.send({
          embeds: [
            {
              title: '🎉 Joyeux anniversaire ! 🎂',
              description:
                `Un très joyeux anniversaire à ${mentionList} ! ` +
                `Nous vous souhaitons une excellente journée ! 🎈`,
              color: 0xff69b4,
              footer: {
                text: 'Bot Anniversaire'
              },
              timestamp: new Date()
            }
          ]
        });
      }

    } catch (error) {
      logger.error(
        `Erreur lors du traitement des anniversaires pour le serveur ${guildId} :`,
        error
      );
    }
  }
}
