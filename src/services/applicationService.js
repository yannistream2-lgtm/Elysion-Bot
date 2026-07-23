// applicationService.js

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { PermissionFlagsBits } from 'discord.js';
import { sanitizeInput, sanitizeMarkdown } from '../utils/validation.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplication,
    getApplications,
    createApplication,
    updateApplication,
    getUserApplications,
    getApplicationRoles,
    saveApplicationRoles
} from '../utils/database.js';
import botConfig from '../config/bot.js';

const applicationCooldowns = new Map();
const APPLICATION_SUBMIT_COOLDOWN = (botConfig.applications?.applicationCooldown ?? 24) * 60 * 60 * 1000;

class ApplicationService {
    static sanitizeApplicationText(value, maxLength) {
        return sanitizeMarkdown(sanitizeInput(String(value ?? ''), maxLength));
    }

    static validateApplicationSubmission(data) {
        if (!data.guildId || !data.userId || !data.roleId) {
            throw createError(
                'Champs requis manquants pour la candidature',
                ErrorTypes.VALIDATION,
                'Données de candidature invalides. Veuillez réessayer.',
                { data }
            );
        }

        if (!data.answers || !Array.isArray(data.answers) || data.answers.length === 0) {
            throw createError(
                'La candidature doit contenir des réponses',
                ErrorTypes.VALIDATION,
                'Vous devez répondre à toutes les questions de la candidature.',
                { data }
            );
        }

        for (const answer of data.answers) {
            const sanitizedQuestion = this.sanitizeApplicationText(answer.question, 200);
            const sanitizedAnswer = this.sanitizeApplicationText(answer.answer, 1000);

            if (!sanitizedQuestion || !sanitizedAnswer) {
                throw createError(
                    'Format de réponse invalide',
                    ErrorTypes.VALIDATION,
                    'Toutes les questions doivent avoir une réponse.',
                    { answer }
                );
            }

            if (sanitizedAnswer.length > 1000) {
                throw createError(
                    'Réponse trop longue',
                    ErrorTypes.VALIDATION,
                    'Chaque réponse doit contenir moins de 1000 caractères.',
                    { length: sanitizedAnswer.length }
                );
            }

            if (sanitizedAnswer.trim().length < 10) {
                throw createError(
                    'Réponse trop courte',
                    ErrorTypes.VALIDATION,
                    'Veuillez fournir des réponses pertinentes (au moins 10 caractères).',
                    { length: sanitizedAnswer.length }
                );
            }
        }

        return true;
    }

    static checkApplicationCooldown(userId) {
        const now = Date.now();
        const cooldownKey = `submit_${userId}`;
        const lastSubmit = applicationCooldowns.get(cooldownKey);

        if (lastSubmit && now - lastSubmit < APPLICATION_SUBMIT_COOLDOWN) {
            const remainingTime = Math.ceil((APPLICATION_SUBMIT_COOLDOWN - (now - lastSubmit)) / 1000);
            throw createError(
                'Candidature en période de cooldown',
                ErrorTypes.RATE_LIMIT,
                `Veuillez attendre ${Math.ceil(remainingTime / 60)} minute(s) avant de soumettre une nouvelle candidature.`,
                { remainingTime, userId }
            );
        }

        applicationCooldowns.set(cooldownKey, now);
        return true;
    }

    static async checkManagerPermission(client, guildId, member) {
        const settings = await getApplicationSettings(client, guildId);
        
        const isManager = 
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            (settings.managerRoles && 
             settings.managerRoles.some(roleId => member.roles.cache.has(roleId)));

        if (!isManager) {
            throw createError(
                'L’utilisateur n’a pas la permission de gérer les candidatures',
                ErrorTypes.PERMISSION,
                'Vous n’avez pas la permission de gérer les candidatures.',
                { userId: member.id, guildId }
            );
        }

        return true;
    }

    static async submitApplication(client, data) {
        try {
            
            this.validateApplicationSubmission(data);

            this.checkApplicationCooldown(data.userId);

            const settings = await getApplicationSettings(client, data.guildId);
            if (!settings.enabled) {
                throw createError(
                    'Les candidatures sont désactivées',
                    ErrorTypes.CONFIGURATION,
                    'Les candidatures sont actuellement désactivées sur ce serveur.',
                    { guildId: data.guildId }
                );
            }

            const userApps = await getUserApplications(client, data.guildId, data.userId);
            const pendingApp = userApps.find(app => app.status === 'pending');

            if (pendingApp) {
                throw createError(
                    'L’utilisateur possède déjà une candidature en attente',
                    ErrorTypes.VALIDATION,
                    'Vous avez déjà une candidature en attente. Veuillez patienter jusqu’à son examen.',
                    { userId: data.userId, pendingAppId: pendingApp.id }
                );
            }

            const sanitizedData = {
                ...data,
                answers: data.answers.map(answer => ({
                    question: this.sanitizeApplicationText(answer.question, 200),
                    answer: this.sanitizeApplicationText(answer.answer, 1000)
                }))
            };

            const application = await createApplication(client, sanitizedData);

            logger.info('Candidature soumise', {
                applicationId: application.id,
                userId: data.userId,
                guildId: data.guildId,
                roleId: data.roleId,
                roleName: data.roleName
            });

            return application;
        } catch (error) {
            logger.error('Erreur lors de la soumission de la candidature', {
                error: error.message,
                userId: data.userId,
                guildId: data.guildId,
                stack: error.stack
            });
            throw error;
        }
    }

    static async reviewApplication(client, guildId, applicationId, reviewData) {
        try {
            const { action, reason, reviewerId } = reviewData;

            if (!['approve', 'deny'].includes(action)) {
                throw createError(
                    'Action d’examen invalide',
                    ErrorTypes.VALIDATION,
                    'L’action d’examen doit être soit « approuver », soit « refuser ».',
                    { action }
                );
            }

            const application = await getApplication(client, guildId, applicationId);
            if (!application) {
                throw createError(
                    'Candidature introuvable',
                    ErrorTypes.CONFIGURATION,
                    'La candidature que vous essayez d’examiner n’existe pas.',
                    { applicationId, guildId }
                );
            }

            if (application.status !== 'pending') {
                throw createError(
                    'Candidature déjà traitée',
                    ErrorTypes.VALIDATION,
                    'Cette candidature a déjà été examinée.',
                    { applicationId, status: application.status }
                );
            }

            const status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = reason ? reason.trim().substring(0, 500) : 'Aucune raison fournie.';

            const updatedApplication = await updateApplication(client, guildId, applicationId, {
                status,
                reviewer: reviewerId,
                reviewMessage: sanitizedReason,
                reviewedAt: new Date().toISOString()
            });

            logger.info('Candidature examinée', {
                applicationId,
                guildId,
                status,
                reviewerId,
                userId: application.userId
            });

            return updatedApplication;
        } catch (error) {
            logger.error('Erreur lors de l’examen de la candidature', {
                error: error.message,
                applicationId,
                guildId,
                stack: error.stack
            });
            throw error;
        }
    }

    static async getApplicationsList(client, guildId, filters = {}) {
        try {
            const applications = await getApplications(client, guildId, filters);

            logger.debug('Candidatures récupérées', {
                guildId,
                count: applications.length,
                filters
            });

            return applications;
        } catch (error) {
            logger.error('Erreur lors de la récupération des candidatures', {
                error: error.message,
                guildId,
                filters,
                stack: error.stack
            });
            throw createError(
                'Impossible de récupérer les candidatures',
                ErrorTypes.DATABASE,
                'Une erreur est survenue lors de la récupération des candidatures.',
                { guildId, filters }
            );
        }
    }

    static async updateSettings(client, guildId, updates) {
        try {
            
            if (updates.logChannelId && typeof updates.logChannelId !== 'string') {
                throw createError(
                    'ID du salon de logs invalide',
                    ErrorTypes.VALIDATION,
                    'L’ID du salon fourni est invalide.',
                    { logChannelId: updates.logChannelId }
                );
            }

            if (updates.managerRoles && !Array.isArray(updates.managerRoles)) {
                throw createError(
                    'Format des rôles gestionnaires invalide',
                    ErrorTypes.VALIDATION,
                    'Les rôles gestionnaires doivent être fournis sous forme de tableau.',
                    { managerRoles: updates.managerRoles }
                );
            }

            if (updates.questions) {
                if (!Array.isArray(updates.questions) || updates.questions.length === 0) {
                    throw createError(
                        'Format des questions invalide',
                        ErrorTypes.VALIDATION,
                        'Les questions doivent être fournies sous forme de tableau non vide.',
                        { questions: updates.questions }
                    );
                }

                updates.questions = updates.questions.map(q => 
                    typeof q === 'string' ? q.trim().substring(0, 100) : q
                );
            }

            await saveApplicationSettings(client, guildId, updates);
            const updatedSettings = await getApplicationSettings(client, guildId);

            logger.info('Paramètres des candidatures mis à jour', {
                guildId,
                updates: Object.keys(updates)
            });

            return updatedSettings;
        } catch (error) {
            logger.error('Erreur lors de la mise à jour des paramètres des candidatures', {
                error: error.message,
                guildId,
                updates,
                stack: error.stack
            });
            throw error;
        }
    }

    static async manageApplicationRoles(client, guildId, data) {
        try {
            const { action, roleId, name } = data;

            const currentRoles = await getApplicationRoles(client, guildId);

            if (action === 'add') {
                if (!roleId) {
                    throw createError(
                        'ID du rôle manquant',
                        ErrorTypes.VALIDATION,
                        'Vous devez spécifier un rôle à ajouter.',
                        { action }
                    );
                }

                if (currentRoles.some(appRole => appRole.roleId === roleId)) {
                    throw createError(
                        'Rôle déjà configuré',
                        ErrorTypes.VALIDATION,
                        'Ce rôle est déjà configuré pour les candidatures.',
                        { roleId }
                    );
                }

                currentRoles.push({
                    roleId,
                    name: name ? name.trim().substring(0, 50) : 'Rôle de candidature'
                });

                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Rôle de candidature ajouté', {
                    guildId,
                    roleId,
                    name
                });
            } else if (action === 'remove') {
                if (!roleId) {
                    throw createError(
                        'ID du rôle manquant',
                        ErrorTypes.VALIDATION,
                        'Vous devez spécifier un rôle à supprimer.',
                        { action }
                    );
                }

                const roleIndex = currentRoles.findIndex(appRole => appRole.roleId === roleId);
                if (roleIndex === -1) {
                    throw createError(
                        'Rôle non configuré',
                        ErrorTypes.VALIDATION,
                        'Ce rôle n’est pas configuré pour les candidatures.',
                        { roleId }
                    );
                }

                currentRoles.splice(roleIndex, 1);
                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Rôle de candidature supprimé', {
                    guildId,
                    roleId
                });
            }

            return currentRoles;
        } catch (error) {
            logger.error('Erreur lors de la gestion des rôles de candidature', {
                error: error.message,
                guildId,
                data,
                stack: error.stack
            });
            throw error;
        }
    }

    static async getUserApplications(client, guildId, userId) {
        try {
            const applications = await getUserApplications(client, guildId, userId);

            logger.debug('Candidatures de l’utilisateur récupérées', {
                guildId,
                userId,
                count: applications.length
            });

            return applications;
        } catch (error) {
            logger.error('Erreur lors de la récupération des candidatures de l’utilisateur', {
                error: error.message,
                guildId,
                userId,
                stack: error.stack
            });
            throw createError(
                'Impossible de récupérer vos candidatures',
                ErrorTypes.DATABASE,
                'Une erreur est survenue lors de la récupération de vos candidatures.',
                { guildId, userId }
            );
        }
    }

    static async getSingleApplication(client, guildId, applicationId) {
        try {
            const application = await getApplication(client, guildId, applicationId);

            if (!application) {
                throw createError(
                    'Candidature introuvable',
                    ErrorTypes.CONFIGURATION,
                    'La candidature que vous recherchez n’existe pas.',
                    { applicationId, guildId }
                );
            }

            return application;
        } catch (error) {
            logger.error('Erreur lors de la récupération de la candidature', {
                error: error.message,
                applicationId,
                guildId,
                stack: error.stack
            });
            throw error;
        }
    }
}

export default ApplicationService;
