import {it,expect} from 'vitest';import {validarEdicao,totais,ErroFinanceiro} from '../src/financeiro/decimal';
it('calcula produto exato e subtotal preservando ajustes',()=>{const e=validarEdicao({versaoEsperada:0,quantidade:'3',precoUnitario:'60'});expect(e.precoTotal).toBe('180.0000');expect(totais([e.precoTotal,'30.0000'],'2.00','1.00','3.00')).toEqual({subtotal:'210.00',valorTotal:'214.00'});});
it('half-up mantém precisão e soma antes de centavos',()=>{expect(validarEdicao({versaoEsperada:1,quantidade:'0.5',precoUnitario:'0.0001'}).precoTotal).toBe('0.0001');expect(totais(['0.0049','0.0049'],'0','0','0').subtotal).toBe('0.01');});
it.each(['-1','0','NaN','1,2','1e2','1.00001',null,1])('rejeita quantidade inválida %s',quantidade=>expect(()=>validarEdicao({versaoEsperada:0,quantidade,precoUnitario:'1'})).toThrow(ErroFinanceiro));
it.each(['-1','NaN','1,2','1e2','1.00001',null,1])('rejeita preço inválido %s',precoUnitario=>expect(()=>validarEdicao({versaoEsperada:0,quantidade:'1',precoUnitario})).toThrow(ErroFinanceiro));
it('não permite totais/identificadores enviados pelo cliente',()=>expect(()=>validarEdicao({versaoEsperada:0,quantidade:'1',precoUnitario:'1',precoTotal:'1'})).toThrow());
it('rejeita overflow de produto',()=>expect(()=>validarEdicao({versaoEsperada:0,quantidade:'99999999999999',precoUnitario:'99999999999999'})).toThrow());
it('rejeita total negativo por desconto',()=>expect(()=>totais(['1'],'0','2','0')).toThrow());
