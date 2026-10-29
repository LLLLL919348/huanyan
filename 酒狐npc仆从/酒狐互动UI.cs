using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.GameContent;
using Terraria.GameContent.UI.Elements;
using Terraria.ModLoader;
using Terraria.UI;

namespace 酒狐npc仆从;

public sealed class 酒狐互动UI : UIState
{
    private static int npcWhoAmI = -1;
    private static string chatMessage = "";
    private const float CloseDist = 400f;   //离酒狐超过该距离自动关闭
    private UIPanel panel;
    //★ 查看界面（含武器槽/饰品槽）：记录建面板时的槽位数，槽位数变化时自动重建，
    //  这样装上/卸下「法术超限」后 UI 立刻变化，不需要重进世界。
    private UIPanel detailsPanel;
    private int builtWeaponSlots = -1;
    private int builtAccSlots = -1;
    private bool openedPlayerInventory;
    private bool jumpHeld;   //跳跃键按下状态（用于按下的那一帧触发关闭）
    private int lastMouseItemType;   //用于检测鼠标物品新变化（Shift 快捷放入酒狐）

    public static void Open(int whoAmI)
    {
        npcWhoAmI = whoAmI;
        chatMessage = 酒狐.GetRandomChat();
        酒狐互动系统.Interface.SetState(酒狐互动系统.State);
        酒狐互动系统.State.Rebuild();
    }

    //按 ESC/空格 被 酒狐互动系统 全局关闭时调用：重置按住状态，避免下次打开瞬间又被关闭
    public static void OnClosedByKey()
    {
        酒狐互动系统.State.jumpHeld = false;
    }

    public override void OnInitialize()
    {
        Rebuild();
    }

    public override void Update(GameTime gameTime)
    {
        Main.LocalPlayer.mouseInterface = true;

        //离酒狐太远 → 自动关闭
        if (IsValidNPC())
        {
            float dist = Vector2.Distance(Main.npc[npcWhoAmI].Center, Main.LocalPlayer.Center);
            if (dist > CloseDist)
            {
                Close(null, null);
                return;
            }
        }

        //按下跳跃键的那一帧 → 关闭
        bool jump = Main.LocalPlayer.controlJump;
        if (jump && !jumpHeld)
        {
            Close(null, null);
            return;
        }
        jumpHeld = jump;

        //====Shift + 已从玩家背包拾起物品 → 快捷放入酒狐（饰品优先饰品槽，其余优先背包）====
        bool shift = Microsoft.Xna.Framework.Input.Keyboard.GetState().IsKeyDown(Microsoft.Xna.Framework.Input.Keys.LeftShift);
        if (shift && !Main.mouseItem.IsAir)
        {
            //物品刚进入鼠标（从玩家背包拾起）时处理一次
            if (Main.mouseItem.type != lastMouseItemType)
            {
                lastMouseItemType = Main.mouseItem.type;
                酒狐饰品.存到酒狐(Main.LocalPlayer, Main.mouseItem);
                if (Main.mouseItem.IsAir)
                    lastMouseItemType = 0;
            }
        }
        else
        {
            lastMouseItemType = Main.mouseItem.IsAir ? 0 : Main.mouseItem.type;
        }

        //★「法术超限」装上/卸下 → 武器槽/饰品槽数量变化 → 查看界面立即重建（保持拖动位置）
        if (detailsPanel != null)
        {
            酒狐玩家 d = Main.LocalPlayer.GetModPlayer<酒狐玩家>();
            if (builtWeaponSlots != d.武器槽数量 || builtAccSlots != d.饰品槽数量)
            {
                float l = detailsPanel.Left.Pixels, t = detailsPanel.Top.Pixels;
                ShowDetails(null, null);
                if (detailsPanel != null)
                {
                    detailsPanel.Left.Set(l, 0f);
                    detailsPanel.Top.Set(t, 0f);
                }
            }
        }

        base.Update(gameTime);
    }

    private void Rebuild()
    {
        RemoveAllChildren();
        panel = new 可拖动面板
        {
            BackgroundColor = new Color(24, 27, 42, 165),
            BorderColor = new Color(120, 130, 180, 80)
        };
        // 打开时恢复原位：贴近屏幕下方（原版NPC对话UI附近）
        panel.Left.Set(Main.screenWidth / 2f - 300f, 0f);
        panel.Top.Set(Main.screenHeight - 300f, 0f);
        panel.Width.Set(600f, 0f);
        panel.Height.Set(130f, 0f);
        Append(panel);

        UIText title = new("酒狐互动");
        title.Left.Set(18f, 0f);
        title.Top.Set(10f, 0f);
        panel.Append(title);

        UIText message = new(chatMessage, 0.8f);
        message.Left.Set(18f, 0f);
        message.Top.Set(35f, 0f);
        message.Width.Set(540f, 0f);
        message.Height.Set(24f, 0f);
        panel.Append(message);

        //右上角 X 关闭
        UIText closeX = new("X");
        closeX.Left.Set(566f, 0f);
        closeX.Top.Set(6f, 0f);
        closeX.Width.Set(26f, 0f);
        closeX.Height.Set(30f, 0f);
        closeX.OnLeftClick += Close;
        panel.Append(closeX);

        string mode = "跟随";
        if (IsValidNPC())
            mode = 酒狐NPC状态.GetName(Main.npc[npcWhoAmI]);

        AddButton("查看", 18f, ShowDetails);
        AddButton(mode, 158f, ToggleMode);
        AddButton("聊天", 298f, Chat);
        AddButton("摸摸", 438f, StartPet);
    }

    private void AddButton(string text, float left, UIElement.MouseEvent click)
    {
        UITextPanel<string> button = new(text, 0.9f, true)
        {
            BackgroundColor = new Color(50, 60, 100, 150),
            BorderColor = new Color(120, 130, 180, 70)
        };
        button.Left.Set(left, 0f);
        button.Top.Set(58f, 0f);
        button.Width.Set(125f, 0f);
        button.Height.Set(48f, 0f);
        button.OnLeftClick += click;
        panel.Append(button);
    }

    private void ShowDetails(UIMouseEvent evt, UIElement element)
    {
        RemoveAllChildren();
        openedPlayerInventory = Main.playerInventory;
        Main.playerInventory = true;
        //查看界面面板：可拖动 + 更透明
        UIPanel details = new 可拖动面板
        {
            BackgroundColor = new Color(22, 25, 38, 130),   //更透明
            BorderColor = new Color(120, 130, 180, 70)
        };
        details.Left.Set(Main.screenWidth / 2f - 360f, 0f);
        details.Top.Set(Main.screenHeight / 2f - 220f, 0f);
        details.Width.Set(720f, 0f);
        details.Height.Set(520f, 0f);
        Append(details);
        detailsPanel = details;   //★ 记录，便于槽位数变化时自动重建

        UIText close = new("X");
        close.Left.Set(680f, 0f);
        close.Top.Set(10f, 0f);
        close.Width.Set(25f, 0f);
        close.Height.Set(30f, 0f);
        close.OnLeftClick += Close;
        details.Append(close);

        //左上角入口：蓝色音符 → 打开任务界面
        details.Append(new 酒狐图片按钮(ModContent.Request<Texture2D>("酒狐npc仆从/饰品/blue_note"), 36f)
        {
            Left = { Pixels = 16f },
            Top = { Pixels = 12f },
            Width = { Pixels = 36f },
            Height = { Pixels = 36f },
            OnClick = OpenTasks
        });

        details.Append(new 酒狐投影
        {
            Left = { Pixels = 35f },
            Top = { Pixels = 45f },
            Width = { Pixels = 120f },
            Height = { Pixels = 120f }
        });

        酒狐玩家 data = Main.LocalPlayer.GetModPlayer<酒狐玩家>();
        builtWeaponSlots = data.武器槽数量;   //★ 记录本次构建时的槽位数
        builtAccSlots = data.饰品槽数量;

        //护甲区：投影右侧的头盔/胸甲/护腿三格
        UIText armorTitle = new("护甲");
        armorTitle.Left.Set(172f, 0f);
        armorTitle.Top.Set(48f, 0f);
        details.Append(armorTitle);
        for (int index = 0; index < data.Armor.Length; index++)
        {
            int armorIndex = index;
            AddItemSlot(details, () => data.Armor[armorIndex], item => data.Armor[armorIndex] = item, 172f, 78f + index * 42f, ItemSlot.Context.EquipArmor, false, index);
        }

        //生命/好感/防御（实时刷新，位于投影下方，一处即可）
        details.Append(new 酒狐信息(35f, 180f));

        //右侧装备区：武器槽放在饰品3x3网格正上方
        const float equipCol0 = 444f;   //饰品网格第一列x
        const float equipRow0 = 170f;   //饰品网格第一行y

        UIText equipment = new("武器槽（酒狐按距离自动切换）");
        equipment.Left.Set(equipCol0, 0f);
        equipment.Top.Set(52f, 0f);
        details.Append(equipment);
        //武器槽3（法术超限解锁）放在原来两个的【左边】；未解锁时不显示
        if (data.武器槽数量 >= 3)
            AddItemSlot(details, () => data.Weapon3, data.SetWeapon3, equipCol0 + 0f, 100f, ItemSlot.Context.InventoryItem);
        AddItemSlot(details, () => data.Weapon, data.SetWeapon, equipCol0 + 42f, 100f, ItemSlot.Context.InventoryItem);
        //★ 第二个武器槽，位于原武器槽右边
        AddItemSlot(details, () => data.Weapon2, data.SetWeapon2, equipCol0 + 84f, 100f, ItemSlot.Context.InventoryItem);

        UIText accessoriesTitle = new(data.饰品槽数量 > 9 ? "当前饰品（法术超限 +3）" : "当前饰品");
        accessoriesTitle.Left.Set(equipCol0, 0f);
        accessoriesTitle.Top.Set(144f, 0f);
        details.Append(accessoriesTitle);
        for (int index = 0; index < data.饰品槽数量 && index < data.Accessories.Length; index++)
        {
            int row = index / 3;
            int col = index % 3;
            int accessoryIndex = index;
            AddItemSlot(details, () => data.Accessories[accessoryIndex], item => data.Accessories[accessoryIndex] = item, equipCol0 + col * 42f, equipRow0 + row * 42f, ItemSlot.Context.EquipAccessory, true);
        }

        //物品存储：幻影伙伴风格，4行×10=40格（更紧凑）
        UIText storageTitle = new("物品存储");
        storageTitle.Left.Set(35f, 0f);
        storageTitle.Top.Set(330f, 0f);
        details.Append(storageTitle);
        for (int index = 0; index < data.Storage.Length; index++)
        {
            float left = 35f + (index % 10) * 42f;
            float top = 360f + (index / 10) * 42f;
            int storageIndex = index;
            AddItemSlot(details, () => data.Storage[storageIndex], item => data.Storage[storageIndex] = item, left, top, ItemSlot.Context.InventoryItem);
        }

        //====背包右侧功能按钮：获取全部 / 堆叠附近箱子 / 一键整理====
        const float btnX = 510f;   //存储区右侧
        UIText tools = new("背包功能") { TextColor = new Color(150, 200, 255) };
        tools.Left.Set(btnX, 0f); tools.Top.Set(352f, 0f);
        details.Append(tools);
        AddActionButton(details, "获取全部", btnX, 380f, () => 酒狐玩家.获取全部到玩家(Main.LocalPlayer));
        AddActionButton(details, "堆叠附近箱", btnX, 428f, () => 酒狐玩家.堆叠到附近箱子(Main.LocalPlayer));
        AddActionButton(details, "一键整理", btnX, 476f, () => 酒狐玩家.一键整理背包(Main.LocalPlayer));
    }

    private void AddActionButton(UIElement parent, string text, float left, float top, System.Action action)
    {
        UITextPanel<string> b = new(text, 0.8f, true)
        {
            BackgroundColor = new Color(60, 90, 140, 180),
            BorderColor = new Color(150, 190, 240, 120)
        };
        b.Left.Set(left, 0f); b.Top.Set(top, 0f);
        b.Width.Set(120f, 0f); b.Height.Set(42f, 0f);
        b.OnLeftClick += (evt, el) => { try { action(); } catch { }; Rebuild(); };
        parent.Append(b);
    }

    private static void AddItemSlot(UIElement parent, Func<Item> getter, Action<Item> setter, float left, float top, int context, bool accessoryOnly = false, int armorKind = -1)
    {
        酒狐物品槽 slot = new(getter, setter, context, accessoryOnly, armorKind);
        slot.Left.Set(left, 0f);
        slot.Top.Set(top, 0f);
        parent.Append(slot);
    }

    private static bool IsValidNPC()
    {
        return npcWhoAmI >= 0 && npcWhoAmI < Main.maxNPCs && Main.npc[npcWhoAmI].active;
    }
    internal static int 当前酒狐索引 => npcWhoAmI;

    internal static int GetLife() => IsValidNPC() ? Main.npc[npcWhoAmI].life : 0;
    internal static int GetMaxLife() => IsValidNPC() ? Main.npc[npcWhoAmI].lifeMax : 0;
    internal static int 当前防御() => IsValidNPC() ? Main.npc[npcWhoAmI].defense : 0;

    private void ToggleMode(UIMouseEvent evt, UIElement element)
    {
        if (IsValidNPC())
            酒狐NPC状态.AdvanceMode(Main.npc[npcWhoAmI]);
        Rebuild();
    }

    private void Chat(UIMouseEvent evt, UIElement element)
    {
        chatMessage = 酒狐.GetRandomChat();
        Rebuild();
    }

    private void StartPet(UIMouseEvent evt, UIElement element)
    {
        //「摸摸」：让酒狐本体从头播放 petpet 动画（伴史莱姆落地音效），不关闭UI，可连续点击
        if (IsValidNPC())
            酒狐.StartPet(npcWhoAmI);
    }

    private void OpenTasks(UIMouseEvent evt, UIElement element)
    {
        //关闭查看界面，进入任务界面
        酒狐互动系统.Interface.SetState(null);
        酒狐任务UI.Open();
    }

    //综合减伤（%）：由酒狐当前的伤害减免来源叠加（樱眷发簪 = 20%+20%*好感等级，上限60%；磐石水晶对弹幕-5%）
    internal static float FoxDamageReduction()
    {
        if (!IsValidNPC()) return 0f;
        Player owner = 酒狐NPC状态.GetTargetPlayer(Main.npc[npcWhoAmI]);
        if (owner == null) return 0f;
        float reduce = 0f;
        if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<樱眷发簪>()))
            reduce += MathF.Min(0.2f + 0.2f * 酒狐玩家.GetLevel(owner), 0.6f);
        if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<磐石水晶>()))
            reduce += 0.05f;
        return reduce;
    }

    private void Close(UIMouseEvent evt, UIElement element)
    {
        detailsPanel = null;   //★ 查看界面已关闭
        builtWeaponSlots = -1;
        builtAccSlots = -1;
        酒狐互动系统.Interface.SetState(null);
        Main.playerInventory = openedPlayerInventory;
        Main.CloseNPCChatOrSign();
    }
}

internal sealed class 酒狐投影 : UIElement
{
    protected override void DrawSelf(SpriteBatch spriteBatch)
    {
        CalculatedStyle dimensions = GetDimensions();
        // 替换为zhanli站立贴图
        Texture2D standTex = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/zhanli").Value;

        Rectangle source = new Rectangle(0, 0, 40, 56);
        Vector2 position = new Vector2(dimensions.X + dimensions.Width / 2f, dimensions.Y + dimensions.Height / 2f);
        Vector2 origin = new Vector2(20f, 28f);

        // 只绘制zhanli一张图，保持原来2倍缩放
        spriteBatch.Draw(standTex, position, source, Color.White, 0f, origin, 2f, SpriteEffects.None, 0f);
    }
}
internal sealed class 酒狐物品槽 : UIElement
{
    private Item item;
    private readonly Func<Item> getter;
    private readonly Action<Item> setter;
    private readonly int context;
    private readonly bool accessoryOnly;
    private readonly int armorKind;   //-1=普通；0=头盔 1=胸甲 2=护腿

    public 酒狐物品槽(Func<Item> getter, Action<Item> setter, int context, bool accessoryOnly = false, int armorKind = -1)
    {
        this.getter = getter;
        this.setter = setter;
        this.context = context;
        this.accessoryOnly = accessoryOnly;
        this.armorKind = armorKind;
        Width.Set(40f, 0f);
        Height.Set(40f, 0f);
    }

    protected override void DrawSelf(SpriteBatch spriteBatch)
    {
        item = getter() ?? new Item();
        //护甲槽用 EquipArmor 上下文（原版会画对应的护甲槽底），并严格区分部位图标
        ItemSlot.Draw(spriteBatch, ref item, context, GetDimensions().Position());
        //空护甲槽：槽内居中显示【对应装备部位】的真实贴图（头盔/胸甲/护腿各不相同），放大到可见
        if (armorKind >= 0 && item.IsAir)
        {
            CalculatedStyle dims = GetDimensions();
            int iconItem = armorKind == 0 ? Terraria.ID.ItemID.CopperHelmet
                         : armorKind == 1 ? Terraria.ID.ItemID.CopperChainmail
                         : Terraria.ID.ItemID.CopperGreaves;
            Texture2D icon = TextureAssets.Item[iconItem].Value;
            if (icon != null)
            {
                //更严格：三种护甲槽分别用 head/body/leg 部位判定，图标清楚可见
                Rectangle src = new(0, 0, icon.Width, icon.Height);
                //确保三种不同：头盔偏上、胸甲居中、护腿偏下
                float yOff = armorKind == 0 ? -2f : (armorKind == 1 ? 0f : 2f);
                Vector2 size = new(26f, 26f);
                Vector2 center = dims.Position() + new Vector2(dims.Width / 2f, dims.Height / 2f + yOff);
                spriteBatch.Draw(icon, center, src, Color.White * 0.55f, 0f, new Vector2(icon.Width / 2f, icon.Height / 2f), size.X / icon.Width, SpriteEffects.None, 0f);
            }
        }
    }

    public override void LeftClick(UIMouseEvent evt)
    {
        base.LeftClick(evt);
        item = getter() ?? new Item();

        //====Shift 快捷搬运：按住 Shift 点击酒狐背包/槽位 → 移到玩家背包；按住 Shift 点击玩家背包 → 移进酒狐背包====
        bool shift = Microsoft.Xna.Framework.Input.Keyboard.GetState().IsKeyDown(Microsoft.Xna.Framework.Input.Keys.LeftShift);
        if (shift)
        {
            快捷搬运();
            return;
        }

        Item heldItem = Main.mouseItem;
        if (accessoryOnly && !heldItem.IsAir && !heldItem.accessory)
            return;
        //严格护甲类型：头盔槽只能放头部装备、胸甲槽只能放身体、护腿槽只能放腿部
        if (armorKind >= 0 && !heldItem.IsAir)
        {
            bool isCorrect = armorKind == 0 ? heldItem.headSlot >= 0
                           : armorKind == 1 ? heldItem.bodySlot >= 0
                           : heldItem.legSlot >= 0;
            if (!isCorrect)
                return;
        }

        Main.mouseItem = item;
        item = heldItem;
        if (accessoryOnly && !item.IsAir && !item.accessory)
        {
            Item rejectedItem = item;
            item = Main.mouseItem;
            Main.mouseItem = rejectedItem;
        }
        setter(item);
    }

    //Shift 快捷搬运：把当前槽位的物品搬到玩家背包；若槽位为空且鼠标有物品则放入（优先对应槽位类型）
    private void 快捷搬运()
    {
        Player p = Main.LocalPlayer;
        if (p == null) return;

        //槽位为空，鼠标有物品 → 放入（放入前校验槽位类型：饰品槽只能放饰品、护甲槽只能放对应部位）
        if ((item == null || item.IsAir) && !Main.mouseItem.IsAir)
        {
            Item held = Main.mouseItem;
            if (accessoryOnly && !held.accessory) return;
            if (armorKind >= 0)
            {
                bool ok = armorKind == 0 ? held.headSlot >= 0 : armorKind == 1 ? held.bodySlot >= 0 : held.legSlot >= 0;
                if (!ok) return;
            }
            //放入酒狐槽（整组，不放回鼠标）
            setter(held.Clone());
            Main.mouseItem.TurnToAir();
            return;
        }

        //槽位有物品 → 搬到玩家背包（同类叠加优先，其次空槽）
        if (item == null || item.IsAir) return;
        int openSlot = -1;
        for (int i = 0; i < p.inventory.Length; i++)
        {
            Item it = p.inventory[i];
            if (it == null || it.IsAir) { if (openSlot < 0) openSlot = i; continue; }
            if (it.type == item.type && it.stack < it.maxStack)
            {
                int can = it.maxStack - it.stack;
                int move = Math.Min(can, item.stack);
                it.stack += move;
                item.stack -= move;
                if (item.stack <= 0) item.TurnToAir();
                setter(item);
                return;
            }
        }
        if (openSlot >= 0)
        {
            p.inventory[openSlot] = item.Clone();
            item.TurnToAir();
            setter(item);
        }
    }
}

/// <summary>实时刷新的酒狐信息文本：生命、好感、防御、减伤。放在投影下方，一处即可。</summary>
internal sealed class 酒狐信息 : UIElement
{
    public 酒狐信息(float left, float top)
    {
        Left.Set(left, 0f);
        Top.Set(top, 0f);
        Width.Set(220f, 0f);
        Height.Set(120f, 0f);
    }

    protected override void DrawSelf(SpriteBatch spriteBatch)
    {
        CalculatedStyle d = GetDimensions();
        Vector2 pos = d.Position();
        int life = 酒狐互动UI.GetLife();
        int maxLife = 酒狐互动UI.GetMaxLife();
        int level = 酒狐玩家.GetLevel(Main.LocalPlayer);
        int next = 酒狐玩家.GetNextRequirement(Main.LocalPlayer);
        int remaining = level >= 3 ? 0 : next - Main.LocalPlayer.GetModPlayer<酒狐玩家>().Affection;
        int defense = 酒狐互动UI.当前防御();
        float reduce = 酒狐互动UI.FoxDamageReduction();

        //单段文本，一处显示（生命/好感/防御/减伤 / 距离下级）
        string s1 = $"生命值  {life} / {maxLife}";
        string s2 = $"好感度等级  {level} / 3    距离下级还需  {remaining}";
        string s3 = $"防御  {defense}      减伤  {Math.Round(reduce * 100f)}%";

        Utils.DrawBorderString(spriteBatch, s1, pos, Color.White, 0.8f);
        Utils.DrawBorderString(spriteBatch, s2, pos + new Vector2(0f, 22f), new Color(200, 200, 230), 0.75f);
        Utils.DrawBorderString(spriteBatch, s3, pos + new Vector2(0f, 44f), new Color(150, 200, 255), 0.8f);
    }
}

/// <summary>图片按钮：绘制一张贴图并缩放适配尺寸，支持悬停高亮与点击。</summary>
internal sealed class 酒狐图片按钮 : UIElement
{
    private readonly Asset<Texture2D> tex;
    private readonly float scale;   //目标长度（px），按正方形适配
    public UIElement.MouseEvent OnClick;

    public 酒狐图片按钮(Asset<Texture2D> tex, float scale)
    {
        this.tex = tex;
        this.scale = scale;
    }

    protected override void DrawSelf(SpriteBatch spriteBatch)
    {
        CalculatedStyle d = GetDimensions();
        Vector2 pos = d.Position();
        float fit = Math.Min(d.Width, d.Height) / Math.Max(1f, Math.Min(tex.Value.Width, tex.Value.Height));
        Vector2 drawScale = new(tex.Value.Width * fit, tex.Value.Height * fit);
        //保持正方形，居中
        Vector2 center = pos + new Vector2(d.Width / 2f, d.Height / 2f);
        Rectangle src = new(0, 0, tex.Value.Width, tex.Value.Height);
        Color tint = IsMouseHovering ? Color.White : new Color(230, 230, 255);
        spriteBatch.Draw(tex.Value, center, src, tint, 0f, new Vector2(tex.Value.Width / 2f, tex.Value.Height / 2f), Math.Min(d.Width, d.Height) / tex.Value.Width, SpriteEffects.None, 0f);
    }

    public override void LeftClick(UIMouseEvent evt)
    {
        base.LeftClick(evt);
        OnClick?.Invoke(evt, this);
    }

    public override void MouseOver(UIMouseEvent evt)
    {
        base.MouseOver(evt);
        //悬停高亮/缩放
    }
}