using System;
using Terraria;
using Terraria.ID;
using Terraria.Localization;
using Terraria.ModLoader;

namespace 酒狐npc仆从
{
	public class 酒狐npc仆从 : Mod
	{
		public override void Load()
		{
			酒狐语音.Load(this);
		}

		public override void Unload()
		{
			酒狐语音.Unload();
			酒狐表情.Unload();
			酒狐武器特效.Unload();
		}

		[Obsolete("Use ModSystem.AddRecipeGroups when migrating to the new recipe group API.")]
		public override void AddRecipeGroups()
		{
			RecipeGroup anyFlower = new RecipeGroup(
				() => Lang.GetItemNameValue(ItemID.Sunflower),
				ItemID.Sunflower,
				ItemID.Daybloom,
				ItemID.Moonglow,
				ItemID.Blinkroot,
				ItemID.Waterleaf,
				ItemID.Deathweed,
				ItemID.Shiverthorn,
				ItemID.Fireblossom,
				ItemID.JungleSpores);

			RecipeGroup.RegisterGroup("酒狐npc仆从:AnyFlower", anyFlower);

			//任意宝石（紫晶/黄玉/蓝玉/翡翠/红玉/钻石）
			RecipeGroup anyGem = new RecipeGroup(
				() => Lang.GetItemNameValue(ItemID.Amethyst),
				ItemID.Amethyst, ItemID.Topaz, ItemID.Sapphire,
				ItemID.Emerald, ItemID.Ruby, ItemID.Diamond);

			RecipeGroup.RegisterGroup("酒狐npc仆从:AnyGem", anyGem);

			//任意大宝石（大紫晶/大黄玉/大蓝玉/大翡翠/大红玉/大钻石）
			RecipeGroup largeGem = new RecipeGroup(
				() => Lang.GetItemNameValue(ItemID.LargeAmethyst),
				ItemID.LargeAmethyst, ItemID.LargeTopaz, ItemID.LargeSapphire,
				ItemID.LargeEmerald, ItemID.LargeRuby, ItemID.LargeDiamond);

			RecipeGroup.RegisterGroup("酒狐npc仆从:LargeGem", largeGem);

			//任意玩偶（向导巫毒玩偶 / 服装商巫毒玩偶）
			RecipeGroup anyDoll = new RecipeGroup(
				() => Lang.GetItemNameValue(ItemID.GuideVoodooDoll),
				ItemID.GuideVoodooDoll, ItemID.ClothierVoodooDoll);

			RecipeGroup.RegisterGroup("酒狐npc仆从:AnyDoll", anyDoll);
		}
	}
}
