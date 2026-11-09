// src/scripts/vtt/mapStage.ts
// Controlador del canvas Konva para el mapa táctico del VTT.
//
// DECISION (F2-1): Todo se maneja internamente en coordenadas de la imagen original.
// Al stage se le aplican escala y traslación para el zoom y pan.
// DECISION (F2-2): La imagen se dibuja directamente en Konva sin toDataURL ni conversiones de exportación.

import type { MapDoc, GridConfig } from '../models/map.ts';
import {
  fitToContainer,
  zoomAtPoint,
  pinchZoom,
  screenToMap,
  type Viewport,
  type Point,
  ZOOM_LIMITS,
} from './geometry.ts';

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

  private bgImageNode: any;
  private gridShapeNode: any;

  private currentMap: MapDoc | null = null;
  private currentGrid: GridConfig | null = null;
  private currentHtmlImage: HTMLImageElement | null = null;
  private gridMode: 'high-contrast' | 'subtle' | 'hidden' = 'high-contrast';

  private resizeObserver: ResizeObserver | null = null;
  private hasInitialFit = false;

  // Touch tracking para pinch-zoom
  private p1Prev: Point | null = null;
  private p2Prev: Point | null = null;

  constructor(container: HTMLElement, Konva: any, options: MapStageControllerOptions) {
    super();
    this.container = container;
    this.Konva = Konva;
    this.mode = options.mode;

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

    // 2. Capas en orden estricto (fondo, grilla, tokens, niebla)
    this.bgLayer = new this.Konva.Layer({ listening: false });
    this.gridLayer = new this.Konva.Layer({ listening: false });
    this.tokenLayer = new this.Konva.Layer({ listening: true }); // Fase 3
    this.fogLayer = new this.Konva.Layer({ listening: false }); // Fase 4

    this.stage.add(this.bgLayer);
    this.stage.add(this.gridLayer);
    this.stage.add(this.tokenLayer);
    this.stage.add(this.fogLayer);

    // 3. Nodos de fondo y grilla
    this.bgImageNode = new this.Konva.Image({
      x: 0,
      y: 0,
      image: null,
      listening: false,
    });
    this.bgLayer.add(this.bgImageNode);

    this.gridShapeNode = new this.Konva.Shape({
      listening: false,
      sceneFunc: (context: any, shape: any) => {
        this.drawGrid(context, shape);
      },
    });
    this.gridLayer.add(this.gridShapeNode);

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

    // Notificar movimiento de viewport al arrastrar
    this.stage.on('dragmove', () => {
      this.emitViewChanged();
      this.gridLayer.batchDraw();
    });

    // Clic en mapa para selección o coordenadas
    this.stage.on('click tap', (e: any) => {
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      const currentView: Viewport = {
        scale: this.stage.scaleX(),
        x: this.stage.x(),
        y: this.stage.y(),
      };
      const mapPt = screenToMap(pointer, currentView);
      this.dispatchEvent(
        new CustomEvent('map-click', {
          detail: {
            mapX: mapPt.x,
            mapY: mapPt.y,
            screenX: pointer.x,
            screenY: pointer.y,
            target: e.target,
          },
        })
      );
    });

    // Soporte táctil multi-touch (Pinch Zoom) en contenedor
    const content = this.stage.getContent();
    content.style.touchAction = 'none';

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

    if (!map) {
      this.currentHtmlImage = null;
      this.bgImageNode.image(null);
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
    this.currentGrid = { ...grid };
    this.gridLayer.batchDraw();
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
    this.stage.destroy();
  }
}
