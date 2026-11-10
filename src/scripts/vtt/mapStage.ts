// src/scripts/vtt/mapStage.ts
// Controlador del canvas Konva para el mapa táctico del VTT.
//
// DECISION (F2-1): Todo se maneja internamente en coordenadas de la imagen original.
// Al stage se le aplican escala y traslación para el zoom y pan.
// DECISION (F2-2): La imagen se dibuja directamente en Konva sin toDataURL ni conversiones de exportación.

import type { MapDoc, GridConfig, Token, FogShape } from '../models/map.ts';
import type { SessionStatus } from '../models/campaign.ts';
import { normalizeStatus, canPerform } from './sessionStatus.ts';
import {
  canMoveToken,
  tokenPixelSize,
  snapTokenPosition,
  resolveTokenPosition,
  type TokenViewer,
  type LiveTokenPosition,
} from './tokens.ts';
import {
  normalizeRect,
  clampRectToImage,
  isTinyRect,
  fogOps,
  simplifyPoints,
  createBrushShape,
} from './fog.ts';
import anime from 'animejs';
import {
  fitToContainer,
  zoomAtPoint,
  pinchZoom,
  screenToMap,
  type Viewport,
  type Point,
  ZOOM_LIMITS,
} from './geometry.ts';

export type MapTool =
  | 'none'
  | 'fog-reveal'
  | 'fog-cover'
  | 'fog-brush-reveal'
  | 'fog-brush-cover';

function hexToRgba(hex: string, alpha: number): string {
  let c = (hex || '#ffffff').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(255, 255, 255, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface MapStageControllerOptions {
  mode: 'dm' | 'player';
  initialMap?: MapDoc | null;
}

export class MapStageController extends EventTarget {
  private container: HTMLElement;
  private Konva: any;
  private mode: 'dm' | 'player';

  public stage: any;
  public bgLayer: any;
  public gridLayer: any;
  public tokenLayer: any;
  public fogLayer: any;
  public toolLayer: any;

  private bgImageNode: any;
  private gridShapeNode: any;
  private fogShapeNode: any = null;
  private fogShapes: FogShape[] = [];
  private isPlayerFogView = false;

  private currentMap: MapDoc | null = null;
  private currentGrid: GridConfig | null = null;
  private currentHtmlImage: HTMLImageElement | null = null;
  private gridMode: 'high-contrast' | 'subtle' | 'hidden' = 'high-contrast';

  private resizeObserver: ResizeObserver | null = null;
  private hasInitialFit = false;

  // Estado y herramientas de Niebla (Fase 4: T-40, T-41, Pincel)
  private currentTool: MapTool = 'none';
  private isDrawingFog = false;
  private fogDragStart: Point | null = null;
  private previewRectNode: any = null;
  private brushRadius = 25;
  private isDrawingBrush = false;
  private brushPoints: number[] = [];
  private previewBrushLineNode: any = null;
  private previewBrushCircleNode: any = null;
  private brushCursorNode: any = null;

  // Estado y sincronización de Tokens (Fase 3: T-31, T-33, T-35)
  private tokenNodes = new Map<string, any>();
  private draggingTokenId: string | null = null;
  private currentViewer: TokenViewer = { uid: null, isDm: false };
  private currentStatus: SessionStatus = 'active';
  private imageCache = new Map<string, HTMLImageElement>();
  private remoteLivePositions = new Map<string, LiveTokenPosition>();
  private tweenStates = new Map<string, { x: number; y: number }>();
  private isPlacementMode = false;

  // Tokens secretos para el DM (Fase 4: T-42, T-43)
  private secretTokenNodes = new Map<string, any>();
  private currentSecretTokens: Record<string, Token> = {};

  // Touch tracking para pinch-zoom
  private p1Prev: Point | null = null;
  private p2Prev: Point | null = null;

  constructor(container: HTMLElement, Konva: any, options: MapStageControllerOptions) {
    super();
    this.container = container;
    this.Konva = Konva;
    this.mode = options.mode;
    this.currentViewer = { uid: null, isDm: options.mode === 'dm' };

    // Configuración inicial de Konva
    if (this.Konva.hitOnDragEnabled !== undefined) {
      this.Konva.hitOnDragEnabled = true;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Stage principal
    this.stage = new this.Konva.Stage({
      container,
      width,
      height,
      draggable: true,
    });
    if (typeof this.stage.dragDistance === 'function') {
      this.stage.dragDistance(4);
    }

    // 2. Capas en orden estricto (fondo, grilla, tokens, niebla, herramientas)
    this.bgLayer = new this.Konva.Layer({ listening: true });
    this.gridLayer = new this.Konva.Layer({ listening: false });
    this.tokenLayer = new this.Konva.Layer({ listening: true }); // Fase 3
    this.fogLayer = new this.Konva.Layer({ listening: false }); // Fase 4
    this.toolLayer = new this.Konva.Layer({ listening: false }); // Fase 4 preview

    this.stage.add(this.bgLayer);
    this.stage.add(this.gridLayer);
    this.stage.add(this.tokenLayer);
    this.stage.add(this.fogLayer);
    this.stage.add(this.toolLayer);

    // 3. Nodos de fondo, grilla y niebla
    this.bgImageNode = new this.Konva.Image({
      x: 0,
      y: 0,
      image: null,
      listening: true,
    });
    this.bgLayer.add(this.bgImageNode);

    this.gridShapeNode = new this.Konva.Shape({
      listening: false,
      sceneFunc: (context: any, shape: any) => {
        this.drawGrid(context, shape);
      },
    });
    this.gridLayer.add(this.gridShapeNode);

    this.fogShapeNode = new this.Konva.Shape({
      listening: false,
      sceneFunc: (context: any, shape: any) => {
        this.drawFog(context, shape);
      },
    });
    this.fogLayer.add(this.fogShapeNode);
    if (typeof this.fogLayer.opacity === 'function') {
      this.fogLayer.opacity(this.mode === 'dm' ? 0.5 : 1.0);
    }

    // 4. Inicializar eventos de interacción
    this.setupInteractions();

    // 5. Observer de tamaño de contenedor
    this.setupResizeObserver();

    if (options.initialMap) {
      this.setMap(options.initialMap).catch((err) => {
        console.warn('[MapStageController] Error cargando mapa inicial:', err);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Dibujado de grilla eficiente
  // -------------------------------------------------------------------------

  private drawGrid(context: any, shape: any): void {
    if (!this.currentMap || !this.currentGrid || !this.currentGrid.visible || this.gridMode === 'hidden') {
      return;
    }

    const size = Math.max(8, this.currentGrid.size);
    const { imageWidth, imageHeight } = this.currentMap;
    const { offsetX, offsetY } = this.currentGrid;

    const scale = this.stage.scaleX() || 1;
    // Mantener la línea en 1px de pantalla sin importar el zoom
    const lineWidth = 1 / scale;

    const startX = ((offsetX % size) + size) % size;
    const startY = ((offsetY % size) + size) % size;

    const userColor = this.currentGrid.color || '#ffffff';
    const userOpacity = typeof this.currentGrid.opacity === 'number'
      ? Math.max(0.05, Math.min(1, this.currentGrid.opacity))
      : 0.65;

    if (this.gridMode === 'high-contrast') {
      // 1. Trazado base oscuro (sombra/borde de contraste) para fondos claros o complejos
      context.beginPath();
      context.strokeStyle = `rgba(0, 0, 0, ${Math.min(0.8, userOpacity * 0.9)})`;
      context.lineWidth = lineWidth * 1.8;

      for (let x = startX; x <= imageWidth; x += size) {
        context.moveTo(x, 0);
        context.lineTo(x, imageHeight);
      }
      for (let y = startY; y <= imageHeight; y += size) {
        context.moveTo(0, y);
        context.lineTo(imageWidth, y);
      }
      context.stroke();

      // 2. Línea central luminosa con color y opacidad configurados por el usuario
      context.beginPath();
      context.strokeStyle = hexToRgba(userColor, userOpacity);
      context.lineWidth = lineWidth;

      for (let x = startX; x <= imageWidth; x += size) {
        context.moveTo(x, 0);
        context.lineTo(x, imageHeight);
      }
      for (let y = startY; y <= imageHeight; y += size) {
        context.moveTo(0, y);
        context.lineTo(imageWidth, y);
      }
      context.stroke();
    } else {
      // Modo sutil
      context.beginPath();
      context.strokeStyle = hexToRgba(userColor, userOpacity * 0.45);
      context.lineWidth = lineWidth;

      for (let x = startX; x <= imageWidth; x += size) {
        context.moveTo(x, 0);
        context.lineTo(x, imageHeight);
      }
      for (let y = startY; y <= imageHeight; y += size) {
        context.moveTo(0, y);
        context.lineTo(imageWidth, y);
      }
      context.stroke();
    }

    context.strokeShape(shape);
  }

  // -------------------------------------------------------------------------
  // Interacciones: Rueda, Pan, Touch (Pellizco) y Click
  // -------------------------------------------------------------------------

  private setupInteractions(): void {
    // Zoom con rueda de ratón centrado en el cursor (T-22)
    this.stage.on('wheel', (e: any) => {
      e.evt.preventDefault();
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
      const currentView: Viewport = {
        scale: this.stage.scaleX(),
        x: this.stage.x(),
        y: this.stage.y(),
      };

      const nextView = zoomAtPoint(currentView, pointer, factor);
      this.applyView(nextView);
    });

    const dispatchMapClick = (pointer: Point, target: any) => {
      const currentView: Viewport = {
        scale: this.stage.scaleX(),
        x: this.stage.x(),
        y: this.stage.y(),
      };
      const mapPt = screenToMap(pointer, currentView);
      const detail = {
        mapX: mapPt.x,
        mapY: mapPt.y,
        screenX: pointer.x,
        screenY: pointer.y,
        target,
      };
      this.dispatchEvent(new CustomEvent('map-click', { detail }));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('map-click', { detail }));
      }
    };

    let pointerDownPos: Point | null = null;
    let didDragStage = false;

    this.stage.on('mousedown touchstart', (e: any) => {
      if (this.currentTool === 'fog-reveal' || this.currentTool === 'fog-cover') {
        const p = this.stage.getPointerPosition();
        if (p) {
          const currentView: Viewport = {
            scale: this.stage.scaleX(),
            x: this.stage.x(),
            y: this.stage.y(),
          };
          this.isDrawingFog = true;
          this.fogDragStart = screenToMap(p, currentView);
          this.updateFogPreview(this.fogDragStart);
        }
        return;
      }
      if (this.currentTool === 'fog-brush-reveal' || this.currentTool === 'fog-brush-cover') {
        const p = this.stage.getPointerPosition();
        if (p) {
          const currentView: Viewport = {
            scale: this.stage.scaleX(),
            x: this.stage.x(),
            y: this.stage.y(),
          };
          const mapPt = screenToMap(p, currentView);
          this.isDrawingBrush = true;
          this.brushPoints = [mapPt.x, mapPt.y];
          this.updateBrushPreview(this.brushPoints);
        }
        return;
      }
      const p = this.stage.getPointerPosition();
      if (p) pointerDownPos = { ...p };
      didDragStage = false;
    });

    this.stage.on('mousemove touchmove', () => {
      const p = this.stage.getPointerPosition();
      if (!p) return;
      const currentView: Viewport = {
        scale: this.stage.scaleX(),
        x: this.stage.x(),
        y: this.stage.y(),
      };
      const mapPt = screenToMap(p, currentView);

      if (this.isDrawingFog && this.fogDragStart) {
        this.updateFogPreview(mapPt);
        return;
      }

      if (this.isDrawingBrush) {
        const lastX = this.brushPoints[this.brushPoints.length - 2];
        const lastY = this.brushPoints[this.brushPoints.length - 1];
        const dx = mapPt.x - lastX;
        const dy = mapPt.y - lastY;
        if (dx * dx + dy * dy >= 25) { // al menos 5px en coords de mapa
          this.brushPoints.push(mapPt.x, mapPt.y);
          this.updateBrushPreview(this.brushPoints);
        }
        return;
      }

      if (this.currentTool === 'fog-brush-reveal' || this.currentTool === 'fog-brush-cover') {
        this.updateBrushCursor(mapPt);
      }
    });

    this.stage.on('mouseleave', () => {
      if (this.brushCursorNode) {
        this.brushCursorNode.visible(false);
        this.toolLayer.batchDraw();
      }
    });

    this.stage.on('mouseup touchend', () => {
      if (this.isDrawingFog && this.fogDragStart) {
        const p = this.stage.getPointerPosition();
        this.isDrawingFog = false;
        const start = this.fogDragStart;
        this.fogDragStart = null;
        this.clearToolLayer();

        if (p && this.currentMap && start) {
          const currentView: Viewport = {
            scale: this.stage.scaleX(),
            x: this.stage.x(),
            y: this.stage.y(),
          };
          const end = screenToMap(p, currentView);
          const rawRect = normalizeRect(start.x, start.y, end.x, end.y);
          const clamped = clampRectToImage(rawRect, this.currentMap.imageWidth, this.currentMap.imageHeight);

          if (!isTinyRect(clamped)) {
            const shape: FogShape = {
              kind: 'rect',
              x: Math.round(clamped.x),
              y: Math.round(clamped.y),
              w: Math.round(clamped.w),
              h: Math.round(clamped.h),
              ...(this.currentTool === 'fog-cover' ? { op: 'cover' as const } : {}),
            };
            this.dispatchEvent(new CustomEvent('fog-shape', { detail: { shape } }));
          }
        }
        return;
      }

      if (this.isDrawingBrush) {
        this.isDrawingBrush = false;
        const pts = this.brushPoints;
        this.brushPoints = [];
        this.clearToolLayer();

        if (pts.length >= 2 && this.currentMap) {
          const simplified = simplifyPoints(pts, 8);
          const isCover = this.currentTool === 'fog-brush-cover';
          const shape = createBrushShape(simplified, this.brushRadius, isCover);
          this.dispatchEvent(new CustomEvent('fog-shape', { detail: { shape } }));
        }
        return;
      }
    });

    this.stage.on('dragstart', () => {
      if (this.draggingTokenId || this.currentTool !== 'none') {
        this.stage.stopDrag();
      }
    });

    // Notificar movimiento de viewport al arrastrar
    this.stage.on('dragmove', () => {
      didDragStage = true;
      this.emitViewChanged();
      this.gridLayer.batchDraw();
    });

    this.stage.on('dragend', () => {
      setTimeout(() => {
        didDragStage = false;
      }, 50);
    });

    // Clic en mapa para selección o coordenadas
    this.stage.on('click tap', (e: any) => {
      if (didDragStage || this.currentTool !== 'none') return;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      if (pointerDownPos) {
        const dist = Math.hypot(pointer.x - pointerDownPos.x, pointer.y - pointerDownPos.y);
        if (dist > 8) return;
      }
      dispatchMapClick(pointer, e.target);
    });

    // Soporte táctil multi-touch (Pinch Zoom) en contenedor
    const content = this.stage.getContent();
    content.style.touchAction = 'none';

    // Captura garantizada de clics en modo colocación directamente en el elemento DOM
    content.addEventListener('click', (e: MouseEvent) => {
      if (!this.isPlacementMode) return;
      const rect = content.getBoundingClientRect();
      const pointer = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      dispatchMapClick(pointer, e.target);
    });

    content.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        if (this.stage.isDragging()) {
          this.stage.stopDrag();
        }
        this.stage.draggable(false);
        const rect = content.getBoundingClientRect();
        this.p1Prev = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        this.p2Prev = { x: e.touches[1].clientX - rect.left, y: e.touches[1].clientY - rect.top };
      }
    }, { passive: false });

    content.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 2 && this.p1Prev && this.p2Prev) {
        e.preventDefault();
        const rect = content.getBoundingClientRect();
        const p1: Point = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        const p2: Point = { x: e.touches[1].clientX - rect.left, y: e.touches[1].clientY - rect.top };

        const currentView: Viewport = {
          scale: this.stage.scaleX(),
          x: this.stage.x(),
          y: this.stage.y(),
        };

        const nextView = pinchZoom(currentView, this.p1Prev, this.p2Prev, p1, p2);
        this.applyView(nextView);

        this.p1Prev = p1;
        this.p2Prev = p2;
      }
    }, { passive: false });

    const resetTouches = () => {
      this.p1Prev = null;
      this.p2Prev = null;
      this.stage.draggable(true);
    };

    content.addEventListener('touchend', resetTouches);
    content.addEventListener('touchcancel', resetTouches);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.stage.width(width);
          this.stage.height(height);

          // Si es la primera vez que tenemos dimensiones y mapa cargado, encuadrar
          if (!this.hasInitialFit && this.currentMap) {
            this.fit();
            this.hasInitialFit = true;
          } else {
            this.stage.batchDraw();
          }
        }
      }
    });

    this.resizeObserver.observe(this.container);
  }

  // -------------------------------------------------------------------------
  // API Pública del Controlador
  // -------------------------------------------------------------------------

  /**
   * Carga y renderiza un nuevo mapa en el stage.
   */
  public async setMap(map: MapDoc | null): Promise<void> {
    const isDifferentMap = !this.currentMap || (map && map.id !== this.currentMap.id);
    this.currentMap = map;
    this.currentGrid = map?.grid ? { ...map.grid } : null;
    if (map?.grid?.size) {
      this.brushRadius = Math.max(10, Math.round(map.grid.size / 2));
    }

    if (!map) {
      this.clearTokens();
      this.currentHtmlImage = null;
      this.bgImageNode.image(null);
      this.fogShapes = [];
      this.clearToolLayer();
      this.bgLayer.batchDraw();
      this.gridLayer.batchDraw();
      this.tokenLayer.batchDraw();
      this.fogLayer.batchDraw();
      return;
    }

    // Precargar imagen
    const img = new Image();
    img.src = map.imageUrl;

    await new Promise<void>((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`Tiempo de espera agotado cargando imagen: ${map.imageUrl}`));
      }, 8000);

      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`No se pudo cargar la imagen del mapa: ${map.imageUrl}`));
      };
    });

    this.currentHtmlImage = img;
    this.bgImageNode.image(img);
    this.bgImageNode.width(map.imageWidth);
    this.bgImageNode.height(map.imageHeight);

    // Cargar y sincronizar tokens del mapa (T-31)
    this.setTokens(map.tokens || {});

    // Cargar y sincronizar niebla de guerra (T-41)
    this.setFog(map.fogRevealed || []);

    if (isDifferentMap || !this.hasInitialFit) {
      this.fit();
      this.hasInitialFit = true;
    } else {
      this.stage.batchDraw();
    }
  }

  /**
   * Actualiza la configuración de la grilla de manera inmediata (vista previa local).
   */
  public setGrid(grid: GridConfig): void {
    const sizeChanged = this.currentGrid?.size !== grid.size;
    this.currentGrid = { ...grid };
    this.gridLayer.batchDraw();
    if (sizeChanged) {
      this.relayoutTokens();
    }
  }

  /**
   * Activa o desactiva el modo de colocación de token (T-30).
   * Al estar activo, desactiva el arrastre del mapa y muestra cursor en cruz para clic preciso.
   */
  public setPlacementMode(active: boolean): void {
    this.isPlacementMode = active;
    if (active) {
      if (this.stage.isDragging()) {
        this.stage.stopDrag();
      }
      this.stage.draggable(false);
      this.container.style.cursor = 'crosshair';
      const content = this.stage.getContent();
      if (content) content.style.cursor = 'crosshair';
    } else {
      this.stage.draggable(true);
      this.container.style.cursor = 'default';
      const content = this.stage.getContent();
      if (content) content.style.cursor = 'default';
    }
  }

  /**
   * Cambia la herramienta activa del DM (none, fog-reveal, fog-cover, fog-brush-reveal, fog-brush-cover) (T-40).
   */
  public setTool(tool: MapTool): void {
    if (this.currentTool === tool) return;
    this.currentTool = tool;
    this.clearToolLayer();

    if (tool !== 'none') {
      if (this.isPlacementMode) {
        this.setPlacementMode(false);
      }
      if (this.stage.isDragging()) {
        this.stage.stopDrag();
      }
      this.stage.draggable(false);
      this.container.style.cursor = 'crosshair';
      const content = this.stage.getContent();
      if (content) content.style.cursor = 'crosshair';
    } else {
      this.stage.draggable(true);
      this.container.style.cursor = 'default';
      const content = this.stage.getContent();
      if (content) content.style.cursor = 'default';
    }

    this.dispatchEvent(new CustomEvent('tool-changed', { detail: { tool: this.currentTool } }));
  }

  public getTool(): MapTool {
    return this.currentTool;
  }

  public setBrushRadius(radius: number): void {
    this.brushRadius = Math.max(4, Math.round(radius));
    if (this.brushCursorNode && typeof this.brushCursorNode.radius === 'function') {
      this.brushCursorNode.radius(this.brushRadius);
      this.toolLayer.batchDraw();
    }
  }

  public getBrushRadius(): number {
    return this.brushRadius;
  }

  /**
   * Sincroniza la lista de formas de niebla reveladas/cubiertas (T-41).
   */
  public setFog(shapes: FogShape[]): void {
    this.fogShapes = shapes || [];
    if (this.currentMap) {
      this.currentMap.fogRevealed = [...this.fogShapes];
    }
    this.fogLayer.batchDraw();
  }

  /**
   * Alterna la opacidad de la niebla en modo DM entre semitransparente (0.5) y vista de jugador (1.0).
   */
  public setPlayerFogView(enable: boolean): void {
    this.isPlayerFogView = enable;
    if (this.mode === 'dm') {
      if (typeof this.fogLayer.opacity === 'function') {
        this.fogLayer.opacity(enable ? 1.0 : 0.5);
      }
      this.fogLayer.batchDraw();
    }
  }

  public getPlayerFogView(): boolean {
    return this.isPlayerFogView;
  }

  // -------------------------------------------------------------------------
  // Gestión de Tokens en Konva (Fase 3: T-31, T-33, T-35)
  // -------------------------------------------------------------------------

  /**
   * Actualiza el espectador actual para permisos de arrastre y resaltado visual (D7, RF-23).
   */
  public setViewer(viewer: TokenViewer): void {
    this.currentViewer = { ...viewer };
    this.updateTokensInteractivity();
  }

  /**
   * Actualiza el estado de la sesión y ajusta la interactividad de los tokens (D7, F0B-4).
   */
  public setStatus(status: SessionStatus | string): void {
    const nextStatus = normalizeStatus(status);
    if (this.currentStatus === nextStatus) return;
    this.currentStatus = nextStatus;

    // Si se pausa o termina durante un arrastre, cancelar y revertir posición
    if (nextStatus !== 'active') {
      // La niebla se puede preparar en pausa; solo se cancela la herramienta al terminar.
      if (nextStatus === 'ended' && this.currentTool !== 'none') {
        this.setTool('none');
      }
      if (this.draggingTokenId) {
        const tid = this.draggingTokenId;
        const node = this.tokenNodes.get(tid);
        if (node && node.isDragging()) {
          node.stopDrag();
        }
        this.draggingTokenId = null;
        this.stage.container().style.cursor = 'default';
        this.revertTokenMove(tid);
      }
    }

    this.updateTokensInteractivity();
  }

  /**
   * Sincroniza tokens del mapa aplicando diffing por ID para mantener 60 FPS (criterio 7).
   */
  public setTokens(tokens: Record<string, Token>): void {
    if (this.currentMap) {
      this.currentMap.tokens = { ...tokens };
    }
    const existingIds = new Set(this.tokenNodes.keys());

    for (const [tid, token] of Object.entries(tokens || {})) {
      existingIds.delete(tid);
      const existingNode = this.tokenNodes.get(tid);

      if (existingNode) {
        // Actualizar nodo existente
        (existingNode as any).__tokenData = { ...token };

        // Si se está arrastrando localmente, no sobreescribir la posición visual hasta terminar
        if (this.draggingTokenId !== tid) {
          const livePos = this.remoteLivePositions.get(tid);
          const effectivePos = resolveTokenPosition(token, livePos);
          existingNode.position(effectivePos);
        }

        const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
        const d = tokenPixelSize(token, grid);
        this.buildTokenVisuals(existingNode, token, d);

        const canMove = canMoveToken(token, this.currentViewer, this.currentStatus);
        existingNode.draggable(canMove);
      } else {
        // Crear nuevo nodo de token
        const newNode = this.createTokenNode(tid, token);
        this.tokenNodes.set(tid, newNode);
        this.tokenLayer.add(newNode);
      }
    }

    // Eliminar tokens que ya no existen
    for (const removedId of existingIds) {
      const node = this.tokenNodes.get(removedId);
      if (node) {
        node.destroy();
        this.tokenNodes.delete(removedId);
      }
      this.remoteLivePositions.delete(removedId);
      const state = this.tweenStates.get(removedId);
      if (state) {
        anime.remove(state);
        this.tweenStates.delete(removedId);
      }
    }

    this.tokenLayer.batchDraw();
  }

  /**
   * Crea un nodo Konva.Group con eventos de arrastre y snap para un token (T-31).
   */
  private createTokenNode(tid: string, token: Token): any {
    const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
    const d = tokenPixelSize(token, grid);
    const canMove = canMoveToken(token, this.currentViewer, this.currentStatus);

    const group = new this.Konva.Group({
      id: tid,
      x: token.x,
      y: token.y,
      draggable: canMove,
      dragDistance: 3,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
    });

    (group as any).__tokenData = { ...token };
    this.buildTokenVisuals(group, token, d);

    group.on('mousedown touchstart', (e: any) => {
      e.cancelBubble = true;
      const currentToken = (group as any).__tokenData || token;
      const canMove = canMoveToken(currentToken, this.currentViewer, this.currentStatus);
      if (!canMove) {
        if (this.currentStatus === 'paused') {
          this.dispatchEvent(
            new CustomEvent('token-locked', {
              detail: {
                tid,
                token: currentToken,
                reason: 'paused',
                message: 'La partida está pausada. El DM debe iniciar la sesión para mover tokens.',
              },
            })
          );
        } else if (this.currentStatus === 'ended') {
          this.dispatchEvent(
            new CustomEvent('token-locked', {
              detail: {
                tid,
                token: currentToken,
                reason: 'ended',
                message: 'La partida ha finalizado.',
              },
            })
          );
        } else if (!this.currentViewer.isDm && currentToken.ownerUid !== this.currentViewer.uid) {
          this.dispatchEvent(
            new CustomEvent('token-locked', {
              detail: {
                tid,
                token: currentToken,
                reason: 'not-owner',
                message: 'Solo el dueño o el DM pueden mover este token.',
              },
            })
          );
        }
      }
    });

    group.on('dragstart', (e: any) => {
      e.cancelBubble = true;
      if (this.stage.isDragging()) {
        this.stage.stopDrag();
      }
      this.draggingTokenId = tid;
      group.moveToTop();
      this.stage.container().style.cursor = 'grabbing';
      this.dispatchEvent(new CustomEvent('token-drag-start', { detail: { tid, token } }));
    });

    group.on('dragmove', (e: any) => {
      e.cancelBubble = true;
      this.dispatchEvent(
        new CustomEvent('token-drag-move', {
          detail: { tid, x: group.x(), y: group.y() },
        })
      );
      this.tokenLayer.batchDraw();
    });

    group.on('dragend', (e: any) => {
      e.cancelBubble = true;
      this.draggingTokenId = null;
      const isMovable = canMoveToken(token, this.currentViewer, this.currentStatus);
      this.stage.container().style.cursor = isMovable ? 'grab' : 'default';

      const bounds = this.currentMap
        ? { width: this.currentMap.imageWidth, height: this.currentMap.imageHeight }
        : undefined;
      const snapped = snapTokenPosition(
        { x: group.x(), y: group.y() },
        token,
        this.currentGrid || { size: 50, offsetX: 0, offsetY: 0 },
        bounds
      );

      // Actualizar posición local de inmediato para que ningún evento remoto o de cleanup revierta
      (group as any).__tokenData = {
        ...((group as any).__tokenData || token),
        x: snapped.x,
        y: snapped.y,
      };
      if (this.currentMap?.tokens?.[tid]) {
        this.currentMap.tokens[tid].x = snapped.x;
        this.currentMap.tokens[tid].y = snapped.y;
      }

      group.to({
        x: snapped.x,
        y: snapped.y,
        duration: 0.08,
        easing: this.Konva.Easings.EaseOut,
        onFinish: () => {
          this.tokenLayer.batchDraw();
        },
      });

      this.dispatchEvent(
        new CustomEvent('token-drag-end', {
          detail: { tid, x: snapped.x, y: snapped.y, token },
        })
      );
    });

    group.on('click tap', (e: any) => {
      e.cancelBubble = true;
      this.dispatchEvent(new CustomEvent('token-select', { detail: { tid, token } }));
    });

    group.on('mouseenter', () => {
      const currentToken = (group as any).__tokenData || token;
      if (canMoveToken(currentToken, this.currentViewer, this.currentStatus)) {
        this.stage.container().style.cursor = 'grab';
      }
    });

    group.on('mouseleave', () => {
      if (!this.draggingTokenId) {
        this.stage.container().style.cursor = 'default';
      }
    });

    return group;
  }

  /**
   * Construye los elementos visuales internos de un token (círculo, imagen/iniciales, etiqueta).
   */
  private buildTokenVisuals(group: any, token: Token, d: number): void {
    group.destroyChildren();

    const r = d / 2;
    const isMyToken = Boolean(this.currentViewer.uid && token.ownerUid === this.currentViewer.uid);
    const outlineColor = isMyToken ? '#38bdf8' : token.color || '#64748b';
    const strokeWidth = isMyToken ? 3.5 : 2;

    // 0. Círculo invisible de captura de eventos (hit area de tamaño completo)
    const hitArea = new this.Konva.Circle({
      x: r,
      y: r,
      radius: r,
      fill: 'rgba(0,0,0,0.001)',
      listening: true,
    });
    group.add(hitArea);

    // Resaltado exterior extra si es el personaje propio del jugador ("Tú")
    if (isMyToken) {
      const halo = new this.Konva.Circle({
        x: r,
        y: r,
        radius: r + 3.5,
        stroke: '#0284c7',
        strokeWidth: 2,
        dash: [6, 3],
        listening: false,
      });
      group.add(halo);
    }

    // 1. Círculo base de fondo
    const baseCircle = new this.Konva.Circle({
      x: r,
      y: r,
      radius: Math.max(1, r - strokeWidth / 2),
      fill: token.color || '#1e293b',
      stroke: outlineColor,
      strokeWidth,
      listening: true,
      shadowColor: isMyToken ? '#0284c7' : 'rgba(0,0,0,0.5)',
      shadowBlur: isMyToken ? 8 : 3,
      shadowOpacity: 0.8,
    });
    group.add(baseCircle);

    // 2. Imagen o iniciales
    if (token.imageUrl) {
      let cachedImg = this.imageCache.get(token.imageUrl);
      if (cachedImg) {
        const clipGroup = new this.Konva.Group({
          clipFunc: (ctx: any) => {
            ctx.arc(r, r, Math.max(1, r - strokeWidth / 2), 0, Math.PI * 2, false);
          },
          listening: false,
        });
        const kImg = new this.Konva.Image({
          image: cachedImg,
          x: 0,
          y: 0,
          width: d,
          height: d,
          listening: false,
          perfectDrawEnabled: false,
        });
        clipGroup.add(kImg);
        group.add(clipGroup);

        // Anillo de borde sobre la imagen
        const ring = new this.Konva.Circle({
          x: r,
          y: r,
          radius: Math.max(1, r - strokeWidth / 2),
          stroke: outlineColor,
          strokeWidth,
          listening: false,
        });
        group.add(ring);
      } else {
        const img = new Image();
        if (token.imageUrl.startsWith('http://') || token.imageUrl.startsWith('https://')) {
          img.crossOrigin = 'anonymous';
        }
        img.src = token.imageUrl;
        img.onload = () => {
          this.imageCache.set(token.imageUrl!, img);
          if (this.tokenNodes.has(group.id())) {
            this.buildTokenVisuals(group, token, d);
            this.tokenLayer.batchDraw();
          }
        };
        img.onerror = () => {
          console.warn('[MapStage] No se pudo cargar imagen de token:', token.imageUrl);
        };
      }
    } else {
      const initials = (token.name || 'T').substring(0, 2).toUpperCase();
      const initText = new this.Konva.Text({
        x: 0,
        y: r - Math.max(6, d * 0.16),
        width: d,
        text: initials,
        align: 'center',
        fontSize: Math.max(11, Math.round(d * 0.32)),
        fontStyle: 'bold',
        fill: '#ffffff',
        listening: false,
        shadowColor: 'rgba(0,0,0,0.7)',
        shadowBlur: 3,
        shadowOffsetY: 1,
      });
      group.add(initText);
    }

    // 3. Etiqueta con el nombre del token
    const fontSize = Math.max(9, Math.min(13, Math.round(d * 0.2)));
    const labelGroup = new this.Konva.Group({
      y: d - Math.round(fontSize * 0.4),
      listening: true,
    });
    const nameText = new this.Konva.Text({
      text: token.name,
      fontSize,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontStyle: 'bold',
      fill: '#f8fafc',
      padding: 2,
      align: 'center',
      listening: false,
    });
    const textW = Math.min(d * 1.6, nameText.width());
    const bgRect = new this.Konva.Rect({
      x: (d - textW - 8) / 2,
      y: 0,
      width: textW + 8,
      height: fontSize + 5,
      fill: 'rgba(15, 23, 42, 0.88)',
      cornerRadius: 4,
      stroke: isMyToken ? 'rgba(56, 189, 248, 0.8)' : 'rgba(51, 65, 85, 0.7)',
      strokeWidth: 1,
      listening: true,
    });
    nameText.x((d - textW) / 2);
    nameText.y(1.5);
    nameText.width(textW);
    labelGroup.add(bgRect);
    labelGroup.add(nameText);
    group.add(labelGroup);

    // Si es mi token, agregar una pequeña etiqueta superior "TÚ"
    if (isMyToken) {
      const youBadge = new this.Konva.Group({
        y: -10,
        listening: false,
      });
      const bW = 24;
      const bRect = new this.Konva.Rect({
        x: (d - bW) / 2,
        y: 0,
        width: bW,
        height: 12,
        fill: '#0284c7',
        cornerRadius: 6,
      });
      const badgeText = new this.Konva.Text({
        text: 'TÚ',
        fontSize: 9,
        fontStyle: 'bold',
        fill: '#ffffff',
        align: 'center',
        listening: false,
      });
      badgeText.x((d - bW) / 2);
      badgeText.y(1);
      badgeText.width(bW);
      youBadge.add(bRect);
      youBadge.add(badgeText);
      group.add(youBadge);
    }
  }

  /**
   * Recalcula la interactividad y resaltado de todos los tokens al cambiar estado o usuario (T-35).
   */
  private updateTokensInteractivity(): void {
    for (const [tid, node] of this.tokenNodes) {
      const token = (node as any).__tokenData;
      if (!token) continue;
      const canMove = canMoveToken(token, this.currentViewer, this.currentStatus);
      node.draggable(canMove);

      const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
      const d = tokenPixelSize(token, grid);
      this.buildTokenVisuals(node, token, d);
    }

    const canMoveSecrets = canPerform('dmPrepare', 'dm', this.currentStatus);
    for (const [_, node] of this.secretTokenNodes) {
      node.draggable(canMoveSecrets);
    }

    this.tokenLayer.batchDraw();
  }

  /**
   * Reajusta tamaño de tokens cuando cambia la escala de la grilla.
   */
  private relayoutTokens(): void {
    const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
    for (const [tid, node] of this.tokenNodes) {
      const token = (node as any).__tokenData;
      if (!token) continue;
      const d = tokenPixelSize(token, grid);
      this.buildTokenVisuals(node, token, d);
    }
    for (const [_, node] of this.secretTokenNodes) {
      const token = (node as any).__tokenData;
      if (!token) continue;
      const d = tokenPixelSize(token, grid);
      this.buildSecretTokenVisuals(node, token, d);
    }
    this.tokenLayer.batchDraw();
  }

  /**
   * Aplica un movimiento recibido por RTDB para un token remoto con animación fluida (T-33).
   */
  public applyRemoteLiveMove(tid: string, pos: { x: number; y: number } | null): void {
    // Si el usuario local está arrastrando este mismo token, ignorar remoto
    if (this.draggingTokenId === tid) return;

    if (pos === null) {
      this.remoteLivePositions.delete(tid);
      // Animación suave hacia la posición fija de Firestore
      const token = this.currentMap?.tokens?.[tid];
      if (token) {
        this.animateTo(tid, token.x, token.y);
      }
      return;
    }

    this.remoteLivePositions.set(tid, {
      x: pos.x,
      y: pos.y,
      receivedAt: Date.now(),
    });

    this.animateTo(tid, pos.x, pos.y);
  }

  /**
   * Anima un token hacia una posición destino en 90ms usando anime.js (T-33).
   */
  private animateTo(tid: string, targetX: number, targetY: number): void {
    const node = this.tokenNodes.get(tid);
    if (!node) return;

    let state = this.tweenStates.get(tid);
    if (!state) {
      state = { x: node.x(), y: node.y() };
      this.tweenStates.set(tid, state);
    }

    anime.remove(state);
    anime({
      targets: state,
      x: targetX,
      y: targetY,
      duration: 90,
      easing: 'easeOutQuad',
      update: () => {
        node.position(state);
        this.tokenLayer.batchDraw();
      },
    });
  }

  /**
   * Revierte un movimiento fallido devolviendo el token a su posición de Firestore.
   */
  public revertTokenMove(tid: string): void {
    const token = this.currentMap?.tokens?.[tid];
    const node = this.tokenNodes.get(tid);
    if (!token || !node) return;

    node.to({
      x: token.x,
      y: token.y,
      duration: 0.15,
      easing: this.Konva.Easings.EaseOut,
      onFinish: () => {
        this.tokenLayer.batchDraw();
      },
    });
  }

  // -------------------------------------------------------------------------
  // Gestión de Tokens Ocultos / Secretos (Fase 4: T-42, T-43)
  // -------------------------------------------------------------------------

  /**
   * Sincroniza tokens secretos en modo DM (T-42).
   */
  public setSecretTokens(tokens: Record<string, Token>): void {
    if (this.mode !== 'dm') return;
    this.currentSecretTokens = { ...tokens };

    const existingIds = new Set(this.secretTokenNodes.keys());

    for (const [tid, token] of Object.entries(tokens || {})) {
      existingIds.delete(tid);
      const existingNode = this.secretTokenNodes.get(tid);

      if (existingNode) {
        (existingNode as any).__tokenData = { ...token };
        if (this.draggingTokenId !== tid) {
          existingNode.position({ x: token.x, y: token.y });
        }
        const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
        const d = tokenPixelSize(token, grid);
        this.buildSecretTokenVisuals(existingNode, token, d);

        const canMove = canPerform('dmPrepare', 'dm', this.currentStatus);
        existingNode.draggable(canMove);
      } else {
        const newNode = this.createSecretTokenNode(tid, token);
        this.secretTokenNodes.set(tid, newNode);
        this.tokenLayer.add(newNode);
      }
    }

    for (const removedId of existingIds) {
      const node = this.secretTokenNodes.get(removedId);
      if (node) {
        node.destroy();
        this.secretTokenNodes.delete(removedId);
      }
    }

    this.tokenLayer.batchDraw();
  }

  private createSecretTokenNode(tid: string, token: Token): any {
    const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
    const d = tokenPixelSize(token, grid);
    const canMove = canPerform('dmPrepare', 'dm', this.currentStatus);

    const group = new this.Konva.Group({
      id: `secret-${tid}`,
      x: token.x,
      y: token.y,
      draggable: canMove,
      dragDistance: 3,
      opacity: 0.55,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
    });

    (group as any).__tokenData = { ...token };
    (group as any).__isSecretToken = true;
    this.buildSecretTokenVisuals(group, token, d);

    group.on('dragstart', (e: any) => {
      e.cancelBubble = true;
      if (this.stage.isDragging()) {
        this.stage.stopDrag();
      }
      this.draggingTokenId = tid;
      group.moveToTop();
      this.stage.container().style.cursor = 'grabbing';
    });

    group.on('dragmove', (e: any) => {
      e.cancelBubble = true;
      this.tokenLayer.batchDraw();
    });

    group.on('dragend', (e: any) => {
      e.cancelBubble = true;
      this.draggingTokenId = null;
      this.stage.container().style.cursor = 'default';

      const bounds = this.currentMap
        ? { width: this.currentMap.imageWidth, height: this.currentMap.imageHeight }
        : undefined;
      const snapped = snapTokenPosition(
        { x: group.x(), y: group.y() },
        token,
        this.currentGrid || { size: 50, offsetX: 0, offsetY: 0 },
        bounds
      );

      (group as any).__tokenData = {
        ...((group as any).__tokenData || token),
        x: snapped.x,
        y: snapped.y,
      };
      if (this.currentSecretTokens[tid]) {
        this.currentSecretTokens[tid].x = snapped.x;
        this.currentSecretTokens[tid].y = snapped.y;
      }

      group.to({
        x: snapped.x,
        y: snapped.y,
        duration: 0.08,
        easing: this.Konva.Easings.EaseOut,
        onFinish: () => {
          this.tokenLayer.batchDraw();
        },
      });

      this.dispatchEvent(
        new CustomEvent('secret-token-drag-end', {
          detail: { tid, x: snapped.x, y: snapped.y, token },
        })
      );
    });

    group.on('click tap', (e: any) => {
      e.cancelBubble = true;
      this.dispatchEvent(new CustomEvent('token-select', { detail: { tid, token, isSecret: true } }));
    });

    group.on('mouseenter', () => {
      if (canPerform('dmPrepare', 'dm', this.currentStatus)) {
        this.stage.container().style.cursor = 'grab';
      }
    });

    group.on('mouseleave', () => {
      if (!this.draggingTokenId) {
        this.stage.container().style.cursor = 'default';
      }
    });

    return group;
  }

  private buildSecretTokenVisuals(group: any, token: Token, d: number): void {
    group.destroyChildren();

    const r = d / 2;
    const strokeWidth = 2.5;

    // 0. Hit area
    const hitArea = new this.Konva.Circle({
      x: r,
      y: r,
      radius: r,
      fill: 'rgba(0,0,0,0.001)',
      listening: true,
    });
    group.add(hitArea);

    // 1. Círculo base con borde punteado ámbar
    const baseCircle = new this.Konva.Circle({
      x: r,
      y: r,
      radius: Math.max(1, r - strokeWidth / 2),
      fill: token.color || '#1e293b',
      stroke: '#f59e0b',
      strokeWidth,
      dash: [4, 4],
      listening: true,
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowBlur: 4,
    });
    group.add(baseCircle);

    // 2. Imagen o iniciales
    if (token.imageUrl) {
      let cachedImg = this.imageCache.get(token.imageUrl);
      if (cachedImg) {
        const clipGroup = new this.Konva.Group({
          clipFunc: (ctx: any) => {
            ctx.arc(r, r, Math.max(1, r - strokeWidth / 2), 0, Math.PI * 2, false);
          },
          listening: false,
        });
        const kImg = new this.Konva.Image({
          image: cachedImg,
          x: 0,
          y: 0,
          width: d,
          height: d,
          listening: false,
          perfectDrawEnabled: false,
        });
        clipGroup.add(kImg);
        group.add(clipGroup);

        const ring = new this.Konva.Circle({
          x: r,
          y: r,
          radius: Math.max(1, r - strokeWidth / 2),
          stroke: '#f59e0b',
          strokeWidth: 2,
          dash: [4, 4],
          listening: false,
        });
        group.add(ring);
      } else {
        const img = new Image();
        if (token.imageUrl.startsWith('http://') || token.imageUrl.startsWith('https://')) {
          img.crossOrigin = 'anonymous';
        }
        img.src = token.imageUrl;
        const tidKey = group.id().replace('secret-', '');
        img.onload = () => {
          this.imageCache.set(token.imageUrl!, img);
          if (this.secretTokenNodes.has(tidKey)) {
            this.buildSecretTokenVisuals(group, token, d);
            this.tokenLayer.batchDraw();
          }
        };
      }
    } else {
      const initials = (token.name || 'T').substring(0, 2).toUpperCase();
      const initText = new this.Konva.Text({
        x: 0,
        y: r - Math.max(6, d * 0.16),
        width: d,
        text: initials,
        align: 'center',
        fontSize: Math.max(11, Math.round(d * 0.32)),
        fontStyle: 'bold',
        fill: '#ffffff',
        listening: false,
      });
      group.add(initText);
    }

    // 3. Badge "OCULTO"
    const badgeW = Math.min(d, 52);
    const badgeGroup = new this.Konva.Group({
      x: (d - badgeW) / 2,
      y: -6,
      listening: false,
    });
    const badgeBg = new this.Konva.Rect({
      width: badgeW,
      height: 12,
      cornerRadius: 6,
      fill: 'rgba(15, 23, 42, 0.95)',
      stroke: '#f59e0b',
      strokeWidth: 1,
    });
    const badgeTxt = new this.Konva.Text({
      text: 'OCULTO',
      fontSize: 8,
      fontStyle: 'bold',
      fill: '#fbbf24',
      width: badgeW,
      align: 'center',
      y: 2,
    });
    badgeGroup.add(badgeBg);
    badgeGroup.add(badgeTxt);
    group.add(badgeGroup);

    // 4. Nombre
    const fontSize = Math.max(9, Math.min(13, Math.round(d * 0.2)));
    const labelGroup = new this.Konva.Group({
      y: d - Math.round(fontSize * 0.4),
      listening: false,
    });
    const nameText = new this.Konva.Text({
      text: token.name,
      fontSize,
      fontStyle: 'bold',
      fill: '#fbbf24',
      align: 'center',
      width: d,
    });
    labelGroup.add(nameText);
    group.add(labelGroup);
  }

  // -------------------------------------------------------------------------
  // Render de Niebla y Vista Previa (Fase 4: T-40, T-41)
  // -------------------------------------------------------------------------

  private drawFog(context: any, _shape: any): void {
    if (!this.currentMap || !this.currentMap.imageWidth || !this.currentMap.imageHeight) {
      return;
    }
    const w = this.currentMap.imageWidth;
    const h = this.currentMap.imageHeight;
    const ctx = context._context || context;

    ctx.save();
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const ops = fogOps(this.fogShapes);
    for (const op of ops) {
      const s = op.shape;
      if (op.op === 'reveal') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#05070a';
        ctx.strokeStyle = '#05070a';
      }

      if (s.kind === 'rect') {
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.fill();
      } else if (s.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'brush' && (s as any).points && (s as any).points.length >= 2) {
        const pts = (s as any).points;
        const r = (s as any).radius || 25;
        if (pts.length === 2) {
          ctx.beginPath();
          ctx.arc(pts[0], pts[1], r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.lineWidth = r * 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) {
            ctx.lineTo(pts[i], pts[i + 1]);
          }
          ctx.stroke();
        }
      } else if (s.kind === 'poly' && (s as any).points && (s as any).points.length >= 6) {
        const pts = (s as any).points;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          ctx.lineTo(pts[i], pts[i + 1]);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  private updateFogPreview(currentMapPt: Point): void {
    if (!this.fogDragStart || !this.currentMap) return;
    const rawRect = normalizeRect(this.fogDragStart.x, this.fogDragStart.y, currentMapPt.x, currentMapPt.y);
    const clamped = clampRectToImage(rawRect, this.currentMap.imageWidth, this.currentMap.imageHeight);

    if (!this.previewRectNode && this.Konva.Rect) {
      this.previewRectNode = new this.Konva.Rect({
        listening: false,
      });
      this.toolLayer.add(this.previewRectNode);
    }

    if (this.previewRectNode) {
      const scale = this.stage.scaleX() || 1;
      const isCover = this.currentTool === 'fog-cover';
      this.previewRectNode.x(clamped.x);
      this.previewRectNode.y(clamped.y);
      this.previewRectNode.width(clamped.w);
      this.previewRectNode.height(clamped.h);
      this.previewRectNode.stroke(isCover ? '#f43f5e' : '#38bdf8');
      this.previewRectNode.strokeWidth(2 / scale);
      this.previewRectNode.dash([6 / scale, 3 / scale]);
      this.previewRectNode.fill(isCover ? 'rgba(244, 63, 94, 0.25)' : 'rgba(56, 189, 248, 0.25)');
      this.previewRectNode.visible(true);
      this.toolLayer.batchDraw();
    }
  }

  private updateBrushCursor(mapPt: Point): void {
    if (!this.Konva.Circle) return;
    const isBrushTool = this.currentTool === 'fog-brush-reveal' || this.currentTool === 'fog-brush-cover';
    if (!isBrushTool) {
      if (this.brushCursorNode) {
        this.brushCursorNode.visible(false);
        this.toolLayer.batchDraw();
      }
      return;
    }

    if (!this.brushCursorNode) {
      this.brushCursorNode = new this.Konva.Circle({
        listening: false,
      });
      this.toolLayer.add(this.brushCursorNode);
    }

    const scale = this.stage.scaleX() || 1;
    const isCover = this.currentTool === 'fog-brush-cover';
    this.brushCursorNode.x(mapPt.x);
    this.brushCursorNode.y(mapPt.y);
    this.brushCursorNode.radius(this.brushRadius);
    this.brushCursorNode.stroke(isCover ? '#f43f5e' : '#38bdf8');
    this.brushCursorNode.strokeWidth(1.5 / scale);
    this.brushCursorNode.dash([4 / scale, 4 / scale]);
    this.brushCursorNode.visible(true);
    this.toolLayer.batchDraw();
  }

  private updateBrushPreview(points: number[]): void {
    if (points.length < 2) return;
    const isCover = this.currentTool === 'fog-brush-cover';
    const strokeColor = isCover ? 'rgba(244, 63, 94, 0.45)' : 'rgba(56, 189, 248, 0.45)';

    if (points.length === 2) {
      if (!this.previewBrushCircleNode && this.Konva.Circle) {
        this.previewBrushCircleNode = new this.Konva.Circle({
          listening: false,
        });
        this.toolLayer.add(this.previewBrushCircleNode);
      }
      if (this.previewBrushCircleNode) {
        this.previewBrushCircleNode.x(points[0]);
        this.previewBrushCircleNode.y(points[1]);
        this.previewBrushCircleNode.radius(this.brushRadius);
        this.previewBrushCircleNode.fill(strokeColor);
        this.previewBrushCircleNode.visible(true);
      }
      if (this.previewBrushLineNode) {
        this.previewBrushLineNode.visible(false);
      }
    } else {
      if (this.previewBrushCircleNode) {
        this.previewBrushCircleNode.visible(false);
      }
      if (!this.previewBrushLineNode && this.Konva.Line) {
        this.previewBrushLineNode = new this.Konva.Line({
          listening: false,
          lineCap: 'round',
          lineJoin: 'round',
        });
        this.toolLayer.add(this.previewBrushLineNode);
      }
      if (this.previewBrushLineNode) {
        this.previewBrushLineNode.points(points);
        this.previewBrushLineNode.stroke(strokeColor);
        this.previewBrushLineNode.strokeWidth(this.brushRadius * 2);
        this.previewBrushLineNode.visible(true);
      }
    }

    this.toolLayer.batchDraw();
  }

  private clearToolLayer(): void {
    if (this.previewRectNode) {
      this.previewRectNode.visible(false);
    }
    if (this.previewBrushLineNode) {
      this.previewBrushLineNode.visible(false);
    }
    if (this.previewBrushCircleNode) {
      this.previewBrushCircleNode.visible(false);
    }
    if (this.brushCursorNode) {
      this.brushCursorNode.visible(false);
    }
    if (typeof this.toolLayer.destroyChildren === 'function') {
      this.toolLayer.destroyChildren();
      this.previewRectNode = null;
      this.previewBrushLineNode = null;
      this.previewBrushCircleNode = null;
      this.brushCursorNode = null;
    }
    this.toolLayer.batchDraw();
  }

  public clearSecretTokens(): void {
    for (const [_, node] of this.secretTokenNodes) {
      node.destroy();
    }
    this.secretTokenNodes.clear();
    this.currentSecretTokens = {};
  }

  /**
   * Limpia todos los tokens y animaciones activas.
   */
  private clearTokens(): void {
    this.tweenStates.forEach((state) => anime.remove(state));
    this.tweenStates.clear();
    this.tokenNodes.forEach((node) => node.destroy());
    this.tokenNodes.clear();
    this.clearSecretTokens();
    this.remoteLivePositions.clear();
    this.draggingTokenId = null;
  }

  /**
   * Encuadra el mapa actual completo ("fit") en el contenedor visible.
   */
  public fit(): void {
    if (!this.currentMap) return;

    const boxW = this.stage.width();
    const boxH = this.stage.height();
    if (boxW <= 0 || boxH <= 0) return;

    const nextView = fitToContainer(
      this.currentMap.imageWidth,
      this.currentMap.imageHeight,
      boxW,
      boxH
    );

    this.applyView(nextView);
  }

  /**
   * Centra el viewport en un token específico por su ID.
   */
  public centerOnToken(tid: string): boolean {
    const node = this.tokenNodes.get(tid);
    if (!node || !this.currentMap) return false;
    const token = (node as any).__tokenData;
    const grid = this.currentGrid || { size: 50, offsetX: 0, offsetY: 0, visible: true };
    const d = tokenPixelSize(token || { size: 1 }, grid);
    const centerX = node.x() + d / 2;
    const centerY = node.y() + d / 2;

    const boxW = this.stage.width();
    const boxH = this.stage.height();
    const currentScale = this.stage.scaleX() || 1;
    const targetScale = Math.max(0.6, Math.min(2.0, currentScale));

    const targetX = boxW / 2 - centerX * targetScale;
    const targetY = boxH / 2 - centerY * targetScale;

    this.applyView({ scale: targetScale, x: targetX, y: targetY });
    return true;
  }

  /**
   * Centra el viewport en coordenadas de mapa dadas.
   */
  public centerOn(mapX: number, mapY: number, scale?: number): void {
    const boxW = this.stage.width();
    const boxH = this.stage.height();
    const targetScale = scale ?? (this.stage.scaleX() || 1);
    const targetX = boxW / 2 - mapX * targetScale;
    const targetY = boxH / 2 - mapY * targetScale;
    this.applyView({ scale: targetScale, x: targetX, y: targetY });
  }

  /**
   * Aplica un factor de zoom relativo al centro actual del contenedor.
   */
  public zoom(factor: number): void {
    const boxW = this.stage.width();
    const boxH = this.stage.height();
    const center: Point = { x: boxW / 2, y: boxH / 2 };

    const currentView: Viewport = {
      scale: this.stage.scaleX(),
      x: this.stage.x(),
      y: this.stage.y(),
    };

    const nextView = zoomAtPoint(currentView, center, factor);
    this.applyView(nextView);
  }

  public getView(): Viewport {
    return {
      scale: this.stage.scaleX(),
      x: this.stage.x(),
      y: this.stage.y(),
    };
  }

  public setView(view: Viewport): void {
    this.applyView(view);
  }

  public getMap(): MapDoc | null {
    return this.currentMap;
  }

  public getGrid(): GridConfig | null {
    return this.currentGrid;
  }

  public getGridMode(): 'high-contrast' | 'subtle' | 'hidden' {
    return this.gridMode;
  }

  public setGridMode(mode: 'high-contrast' | 'subtle' | 'hidden'): void {
    this.gridMode = mode;
    this.gridLayer?.batchDraw();
    this.dispatchEvent(new CustomEvent('grid-mode-changed', { detail: { mode: this.gridMode } }));
  }

  public cycleGridMode(): 'high-contrast' | 'subtle' | 'hidden' {
    const nextMode: Record<'high-contrast' | 'subtle' | 'hidden', 'high-contrast' | 'subtle' | 'hidden'> = {
      'high-contrast': 'subtle',
      'subtle': 'hidden',
      'hidden': 'high-contrast',
    };
    this.setGridMode(nextMode[this.gridMode]);
    return this.gridMode;
  }

  private applyView(view: Viewport): void {
    this.stage.scale({ x: view.scale, y: view.scale });
    this.stage.position({ x: view.x, y: view.y });
    this.stage.batchDraw();
    this.emitViewChanged();
  }

  private emitViewChanged(): void {
    const view = this.getView();
    this.dispatchEvent(new CustomEvent('view-changed', { detail: view }));
  }

  /**
   * Destruye el stage y libera observers y listeners.
   */
  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.clearToolLayer();
    this.clearTokens();
    this.stage.destroy();
  }
}
