using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>混沌之书——每次攻击后片刻再额外造成该攻击5%的伤害（追加伤害同样计入吸血）。</summary>
public sealed class 混沌之书 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/chaos_book_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Purple;
        Item.value = Item.buyPrice(gold: 5);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.Smolstar, 1)         //剑刃法杖（女王史莱姆掉落）
            .AddIngredient(ItemID.QueenSlimeHook, 1)   //不和谐之钩（女王史莱姆掉落）
            .AddIngredient(ItemID.LightShard, 20)        //光明碎片
            .AddIngredient(ItemID.DarkShard, 20)         //暗影碎片
            .AddTile(TileID.DemonAltar)                  //恶魔祭坛
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(178, 96, 255);   //紫红色字体
                break;
            }
        }
    }
}
