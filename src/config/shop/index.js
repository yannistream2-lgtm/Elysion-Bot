import {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
} from './items.js';

import { botConfig } from '../bot.js';

const { currency } = botConfig.economy;

export const shopConfig = {
    name: 'Boutique Elysion',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}s`,
    currencySymbol: currency.symbol || '🪙',
    
    categories: [
        {
            id: 'consumables',
            name: 'Consommables',
            description: 'Objets à usage unique offrant des avantages temporaires',
            icon: '🍯',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: 'Améliorations',
            description: 'Améliorations permanentes qui renforcent vos capacités',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: 'Outils',
            description: 'Équipements vous permettant de récolter des ressources plus efficacement',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: 'Rôles',
            description: 'Rôles spéciaux offrant des avantages uniques',
            icon: '🎭',
            itemTypes: ['role']
        }
    ],
    
    transaction: {
        // Temps d'attente entre deux transactions (en millisecondes).
        cooldown: 1000,

        // Quantité maximale d'objets pouvant être achetée en une fois.
        maxQuantity: 10,

        // Temps maximum pour confirmer un achat (en millisecondes).
        confirmTimeout: 30000,
        
        refundPolicy: {
            // Autoriser les remboursements.
            enabled: true,

            // Durée pendant laquelle un remboursement peut être demandé.
            window: 300000,

            // Frais appliqués lors d'un remboursement (10 %).
            fee: 0.1
        }
    },
    
    ui: {
        // Nombre d'objets affichés par page.
        itemsPerPage: 5,

        // Afficher les objets qui ne sont plus en stock.
        showOutOfStock: true,

        // Afficher les objets que l'utilisateur possède déjà.
        showOwnedItems: true,

        // Afficher si l'utilisateur peut se permettre l'achat.
        showAffordability: true,
        
        colors: {
            primary: '#5865F2',
            success: '#43B581',
            error: '#F04747',
            warning: '#FAA61A',
            info: '#00B0F4',
            
            rarity: {
                common: '#99AAB5',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F',
                mythic: '#E74C3C'
            }
        },
        
        emojis: {
            currency: '🪙',
            quantity: '✖️',
            price: '💵',
            owned: '✅',
            outOfStock: '❌',
            
            types: {
                consumable: '🍯',
                upgrade: '⚡',
                tool: '⛏️',
                role: '🎭'
            }
        }
    },
    
    events: {
        restock: {
            // Activer le réapprovisionnement automatique.
            enabled: true,

            // Intervalle de réapprovisionnement (24 heures).
            interval: 86400000,

            // Salon où l'annonce de réapprovisionnement sera publiée.
            announcementChannel: null,

            // Message envoyé lors du réapprovisionnement.
            message: '🛒 **Boutique réapprovisionnée !** De nouveaux objets sont maintenant disponibles !'
        },
        
        sales: {
            // Activer les promotions.
            enabled: true,

            // Planning des promotions.
            schedule: [
                {
                    // 0 = dimanche.
                    day: 0,

                    // 20 % de réduction.
                    discount: 0.2,

                    message: '🔥 **Promotion du week-end !** -20 % sur tous les objets !'
                },
            ]
        }
    }
};

export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

export function getCurrentPrice(
    itemId,
    { quantity = 1, userData = null } = {}
) {
    const basePrice = getItemPrice(itemId) * quantity;
    
    let discount = 0;
    
    const now = new Date();

    // Vérifier si une promotion est active.
    if (shopConfig.events.sales.enabled) {
        const today = now.getDay();

        const sale = shopConfig.events.sales.schedule.find(
            s => s.day === today
        );

        if (sale) {
            discount += sale.discount;
        }
    }
    
    if (userData) {
        // Les membres Premium bénéficient de 10 % de réduction.
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        // Une commande de 10 objets ou plus bénéficie de 10 % de réduction.
        if (quantity >= 10) {
            discount += 0.1;
        }
    }
    
    // La réduction ne peut pas être inférieure à 0 % ni supérieure à 100 %.
    discount = Math.max(0, Math.min(1, discount));
    
    return Math.floor(basePrice * (1 - discount));
}

export function getCategoryForItem(itemType) {
    return shopConfig.categories.find(
        cat => cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: 'Autres',
        description: 'Objets divers',
        icon: '📦'
    };
}

export function getItemsInCategory(categoryId) {
    const category = shopConfig.categories.find(
        cat => cat.id === categoryId
    );

    if (!category) return [];
    
    return shopItems.filter(
        item => category.itemTypes.includes(item.type)
    );
}
